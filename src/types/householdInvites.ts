import type { HouseholdRole } from './household'

export type HouseholdInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export type HouseholdInvite = {
  id: string
  householdId: string
  email: string
  status: HouseholdInviteStatus
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export type HouseholdMemberSummary = {
  userId: string
  displayName: string
  role: HouseholdRole
}

export type InviteAcceptanceErrorCode =
  | 'invalid'
  | 'expired'
  | 'unavailable'
  | 'email-mismatch'
  | 'email-unconfirmed'
  | 'already-member'
  | 'network'
  | 'unknown'
