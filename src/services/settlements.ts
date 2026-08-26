import { supabase } from './supabase'
import type {
  CreateSettlementInput,
  UpdateSettlementInput,
} from '../types/settlement'

const knownSettlementErrors = [
  'Debes iniciar sesión para registrar una liquidación',
  'Debes iniciar sesión para actualizar una liquidación',
  'Debes iniciar sesión para eliminar una liquidación',
  'El hogar no existe',
  'No perteneces al hogar indicado',
  'La liquidación no existe o ya está eliminada',
  'No perteneces al hogar de esta liquidación',
  'La persona que entrega el dinero no pertenece al hogar',
  'La persona que recibe el dinero no pertenece al hogar',
  'Las personas de origen y destino deben ser diferentes',
  'El importe debe ser mayor que 0',
  'El importe supera el máximo permitido',
  'El importe no puede tener más de dos decimales',
  'La fecha es obligatoria',
]

export class SettlementServiceError extends Error {}

function getSettlementErrorMessage(
  errorMessage: string,
  fallbackMessage: string,
) {
  return (
    knownSettlementErrors.find((message) => errorMessage.includes(message)) ??
    fallbackMessage
  )
}

export async function createSettlement(input: CreateSettlementInput) {
  const { data, error } = await supabase.rpc('create_settlement', {
    p_household_id: input.householdId,
    p_from_user_id: input.fromUserId,
    p_to_user_id: input.toUserId,
    p_amount: input.amount,
    p_settlement_date: input.settlementDate,
    p_note: input.note || null,
  })

  if (error) {
    throw new SettlementServiceError(
      getSettlementErrorMessage(
        error.message,
        'No hemos podido registrar la liquidación.',
      ),
    )
  }

  if (typeof data !== 'string') {
    throw new SettlementServiceError(
      'La liquidación se registró, pero no recibimos su identificador.',
    )
  }

  return data
}

export async function updateSettlement(input: UpdateSettlementInput) {
  const { data, error } = await supabase.rpc('update_settlement', {
    p_settlement_id: input.settlementId,
    p_from_user_id: input.fromUserId,
    p_to_user_id: input.toUserId,
    p_amount: input.amount,
    p_settlement_date: input.settlementDate,
    p_note: input.note || null,
  })

  if (error) {
    throw new SettlementServiceError(
      getSettlementErrorMessage(
        error.message,
        'No hemos podido actualizar la liquidación.',
      ),
    )
  }

  if (typeof data !== 'string') {
    throw new SettlementServiceError(
      'La liquidación se actualizó, pero no recibimos su identificador.',
    )
  }

  return data
}

export async function deleteSettlement(settlementId: string) {
  const { data, error } = await supabase.rpc('delete_settlement', {
    p_settlement_id: settlementId,
  })

  if (error) {
    throw new SettlementServiceError(
      getSettlementErrorMessage(
        error.message,
        'No hemos podido eliminar la liquidación.',
      ),
    )
  }

  if (typeof data !== 'string') {
    throw new SettlementServiceError(
      'La liquidación se eliminó, pero no recibimos su identificador.',
    )
  }

  return data
}
