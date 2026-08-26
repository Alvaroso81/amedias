import { supabase } from './supabase'
import type {
  HouseholdInvite,
  HouseholdInviteStatus,
  HouseholdMemberSummary,
  InviteAcceptanceErrorCode,
} from '../types/householdInvites'

const inviteErrorMessages = {
  INVITE_AUTH_REQUIRED: 'Debes iniciar sesión para gestionar invitaciones.',
  INVITE_OWNER_REQUIRED: 'Solo la persona propietaria puede gestionar invitaciones.',
  INVITE_EMAIL_INVALID: 'Introduce un correo electrónico válido.',
  INVITE_CALLER_EMAIL_MISSING: 'Tu cuenta no tiene un correo electrónico disponible.',
  INVITE_SELF_NOT_ALLOWED: 'No puedes enviarte una invitación a ti mismo.',
  INVITE_ALREADY_MEMBER: 'Esta persona ya forma parte del hogar.',
} as const

export class HouseholdInviteServiceError extends Error {
  code: InviteAcceptanceErrorCode | null

  constructor(message: string, code: InviteAcceptanceErrorCode | null = null) {
    super(message)
    this.name = 'HouseholdInviteServiceError'
    this.code = code
  }
}

function includesDatabaseCode(message: string, code: string) {
  return message.includes(code)
}

function getManagementError(message: string, fallback: string) {
  const knownError = Object.entries(inviteErrorMessages).find(([code]) =>
    includesDatabaseCode(message, code),
  )

  return knownError?.[1] ?? fallback
}

export async function createHouseholdInvite(householdId: string, email: string) {
  try {
    const { data, error } = await supabase.rpc('create_household_invite', {
      p_household_id: householdId,
      p_email: email,
    })

    if (error) {
      throw new HouseholdInviteServiceError(
        getManagementError(error.message, 'No hemos podido crear la invitación.'),
      )
    }

    if (typeof data !== 'string' || !data) {
      throw new HouseholdInviteServiceError(
        'La invitación se creó, pero no hemos recibido su enlace privado.',
      )
    }

    return data
  } catch (error) {
    if (error instanceof HouseholdInviteServiceError) throw error

    throw new HouseholdInviteServiceError(
      'No hemos podido conectar para crear la invitación. Inténtalo de nuevo.',
    )
  }
}

export async function acceptHouseholdInvite(token: string) {
  try {
    const { data, error } = await supabase.rpc('accept_household_invite', {
      p_token: token,
    })

    if (error) {
      const mappings: Array<{
        databaseCode: string
        code: InviteAcceptanceErrorCode
        message: string
      }> = [
        {
          databaseCode: 'INVITE_EMAIL_MISMATCH',
          code: 'email-mismatch',
          message: 'Esta invitación pertenece a otro correo electrónico.',
        },
        {
          databaseCode: 'INVITE_EXPIRED',
          code: 'expired',
          message: 'Esta invitación ha caducado.',
        },
        {
          databaseCode: 'INVITE_UNAVAILABLE',
          code: 'unavailable',
          message: 'Esta invitación ya no está disponible.',
        },
        {
          databaseCode: 'INVITE_INVALID',
          code: 'invalid',
          message: 'Esta invitación no es válida.',
        },
        {
          databaseCode: 'INVITE_CONFIRMED_EMAIL_REQUIRED',
          code: 'email-unconfirmed',
          message: 'Confirma tu correo electrónico antes de aceptar la invitación.',
        },
        {
          databaseCode: 'INVITE_ALREADY_MEMBER',
          code: 'already-member',
          message: 'Esta invitación ya no está disponible.',
        },
      ]
      const mapping = mappings.find(({ databaseCode }) =>
        includesDatabaseCode(error.message, databaseCode),
      )

      throw new HouseholdInviteServiceError(
        mapping?.message ?? 'No hemos podido aceptar la invitación.',
        mapping?.code ?? 'unknown',
      )
    }

    if (typeof data !== 'string') {
      throw new HouseholdInviteServiceError(
        'La invitación se aceptó, pero no hemos recibido el hogar.',
        'unknown',
      )
    }

    return data
  } catch (error) {
    if (error instanceof HouseholdInviteServiceError) throw error

    throw new HouseholdInviteServiceError(
      'No hemos podido conectar para aceptar la invitación.',
      'network',
    )
  }
}

export async function revokeHouseholdInvite(inviteId: string) {
  try {
    const { error } = await supabase.rpc('revoke_household_invite', {
      p_invite_id: inviteId,
    })

    if (error) {
      throw new HouseholdInviteServiceError(
        getManagementError(error.message, 'No hemos podido revocar la invitación.'),
      )
    }
  } catch (error) {
    if (error instanceof HouseholdInviteServiceError) throw error

    throw new HouseholdInviteServiceError(
      'No hemos podido conectar para revocar la invitación.',
    )
  }
}

export async function getHouseholdInvites(householdId: string) {
  const { data, error } = await supabase
    .from('household_invites')
    .select('id, household_id, email, status, expires_at, accepted_at, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new HouseholdInviteServiceError('No hemos podido cargar las invitaciones del hogar.')
  }

  const now = Date.now()

  return data.map((invitation): HouseholdInvite => {
    const storedStatus = invitation.status as HouseholdInviteStatus
    const status =
      storedStatus === 'pending' && new Date(invitation.expires_at).getTime() <= now
        ? 'expired'
        : storedStatus

    return {
      id: invitation.id,
      householdId: invitation.household_id,
      email: invitation.email,
      status,
      expiresAt: invitation.expires_at,
      acceptedAt: invitation.accepted_at,
      createdAt: invitation.created_at,
    }
  })
}

export async function getHouseholdMembers(householdId: string) {
  const membersResult = await supabase
    .from('household_members')
    .select('user_id, role, joined_at')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true })

  if (membersResult.error) {
    throw new HouseholdInviteServiceError('No hemos podido cargar los miembros del hogar.')
  }

  const userIds = membersResult.data.map((member) => member.user_id)
  const profilesResult = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds)

  if (profilesResult.error) {
    throw new HouseholdInviteServiceError('No hemos podido cargar los perfiles del hogar.')
  }

  const profiles = new Map(
    profilesResult.data.map((profile) => [profile.id, profile.display_name]),
  )

  return membersResult.data.map(
    (member): HouseholdMemberSummary => ({
      userId: member.user_id,
      displayName: profiles.get(member.user_id) ?? 'Miembro',
      role: member.role === 'owner' ? 'owner' : 'member',
    }),
  )
}
