import { supabase } from './supabase'
import type {
  CreateExpenseInput,
  ExpenseCategory,
  ExpenseMember,
  UpdateExpenseInput,
} from '../types/expenseCreation'
import type {
  ExpensePaymentDetail,
  ExpenseReadCategory,
  ExpenseReadMember,
  ExpenseRecord,
  ExpenseSplitDetail,
  HouseholdExpenseData,
  SettlementRecord,
} from '../types/expenseRead'

const knownCreateExpenseErrors = [
  'Debes iniciar sesión para crear un gasto',
  'No perteneces al hogar indicado',
  'El concepto del gasto es obligatorio',
  'El importe debe ser mayor que 0',
  'El importe no puede tener más de dos decimales',
  'El importe supera el máximo permitido',
  'El tipo de gasto debe ser common o personal',
  'La fecha del gasto es obligatoria',
  'La categoría no pertenece al hogar o está archivada',
  'El pagador no pertenece al hogar',
  'El importe pagado debe ser mayor que 0',
  'El importe pagado no puede tener más de dos decimales',
  'En esta versión el pagador debe abonar el importe completo',
  'El reparto debe ser un array JSON',
  'Cada elemento del reparto debe ser un objeto JSON',
  'El reparto contiene valores con formato inválido',
  'Cada reparto debe incluir user_id, share_percent y share_amount',
  'No puede repetirse un usuario en el reparto',
  'Todos los participantes del reparto deben pertenecer al hogar',
  'Cada porcentaje debe estar entre 0 y 100',
  'Los porcentajes no pueden tener más de dos decimales',
  'Los importes del reparto no pueden ser negativos',
  'Los importes del reparto no pueden tener más de dos decimales',
  'El gasto debe tener al menos un reparto',
  'La suma de los importes del reparto debe coincidir con el gasto',
  'La suma de los porcentajes del reparto debe ser 100',
  'Un gasto personal debe asignarse íntegramente al pagador',
  'Un gasto personal no puede pagarse con el fondo común',
  'El origen del pago no es válido',
  'Un gasto del fondo común debe ser de tipo common',
  'El fondo común requiere exactamente dos miembros',
  'El fondo común está desactivado',
  'No hay suficiente dinero en el fondo común.',
]

const knownMutationErrors = [
  'Debes iniciar sesión para actualizar un gasto',
  'Debes iniciar sesión para eliminar un gasto',
  'El gasto no existe o ya está eliminado',
  'No perteneces al hogar de este gasto',
  'El concepto es obligatorio',
  'El importe debe ser mayor que 0',
  'El importe supera el máximo permitido',
  'El importe no puede tener más de dos decimales',
  'La fecha es obligatoria',
  'El tipo de gasto no es válido',
  'La categoría no pertenece al hogar o no está activa',
  'Los pagos deben enviarse como una lista',
  'Cada pago debe ser un objeto JSON',
  'Los datos de un pago no son válidos',
  'Cada pago necesita usuario e importe',
  'No puede repetirse un usuario en los pagos',
  'Todos los pagadores deben pertenecer al hogar',
  'Los importes pagados no pueden ser negativos',
  'Un pago supera el máximo permitido',
  'Los pagos no pueden tener más de dos decimales',
  'El gasto debe tener al menos un pago',
  'Los pagos deben sumar exactamente el importe del gasto',
  'El reparto debe enviarse como una lista',
  'Cada reparto debe ser un objeto JSON',
  'Los datos de un reparto no son válidos',
  'Cada reparto necesita usuario, porcentaje e importe',
  'No puede repetirse un usuario en el reparto',
  'Todas las personas del reparto deben pertenecer al hogar',
  'Los porcentajes deben estar entre 0 y 100',
  'Los porcentajes no pueden tener más de dos decimales',
  'Los importes del reparto no pueden ser negativos',
  'Un importe del reparto supera el máximo permitido',
  'Los importes del reparto no pueden tener más de dos decimales',
  'El gasto debe tener al menos un reparto',
  'Los importes del reparto deben sumar exactamente el importe del gasto',
  'El reparto debe sumar exactamente 100 %',
  'Un gasto personal debe corresponder íntegramente a una sola persona',
  'No tienes acceso a este gasto',
  'Un gasto común no puede convertirse en personal',
  'Un gasto personal no puede pagarse con el fondo común',
  'El origen del pago no es válido',
  'Un gasto del fondo común debe ser de tipo common',
  'El fondo común requiere exactamente dos miembros',
  'El fondo común está desactivado',
  'No hay suficiente dinero en el fondo común.',
]

export class ExpenseServiceError extends Error {}

export async function loadHouseholdExpenses(
  householdId: string,
): Promise<HouseholdExpenseData> {
  try {
    const [expensesResult, categoriesResult, membersResult, settlementsResult] = await Promise.all([
      supabase
        .from('expenses')
        .select(
          'id, household_id, description, amount, expense_date, expense_type, personal_owner_id, payment_source, note, category_id, created_by, updated_by, created_at, updated_at',
        )
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('categories')
        .select('id, name, icon')
        .eq('household_id', householdId),
      supabase
        .from('household_members')
        .select('user_id, role, joined_at')
        .eq('household_id', householdId)
        .order('joined_at', { ascending: true }),
      supabase
        .from('settlements')
        .select(
          'id, household_id, from_user_id, to_user_id, amount, settlement_date, note, created_by, updated_by, created_at, updated_at',
        )
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('settlement_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    if (
      expensesResult.error ||
      categoriesResult.error ||
      membersResult.error ||
      settlementsResult.error
    ) {
      throw new ExpenseServiceError('No hemos podido cargar los gastos.')
    }

    const expenseIds = expensesResult.data.map((expense) => expense.id)
    const [paymentsResult, splitsResult] = expenseIds.length
      ? await Promise.all([
          supabase
            .from('expense_payments')
            .select('expense_id, user_id, amount')
            .in('expense_id', expenseIds),
          supabase
            .from('expense_splits')
            .select('expense_id, user_id, share_percent, share_amount')
            .in('expense_id', expenseIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ]

    if (paymentsResult.error || splitsResult.error) {
      throw new ExpenseServiceError('No hemos podido cargar los detalles de los gastos.')
    }

    const profileUserIds = new Set(membersResult.data.map((member) => member.user_id))
    paymentsResult.data.forEach((payment) => profileUserIds.add(payment.user_id))
    splitsResult.data.forEach((split) => profileUserIds.add(split.user_id))
    settlementsResult.data.forEach((settlement) => {
      profileUserIds.add(settlement.from_user_id)
      profileUserIds.add(settlement.to_user_id)
    })

    const userIds = [...profileUserIds]
    const profilesResult = userIds.length
      ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
      : { data: [], error: null }

    if (profilesResult.error) {
      throw new ExpenseServiceError('No hemos podido cargar los perfiles del hogar.')
    }

    const profilesById = new Map(
      profilesResult.data.map((profile) => [profile.id, profile.display_name]),
    )
    const categoriesById = new Map(
      categoriesResult.data.map((category) => [
        category.id,
        {
          id: category.id,
          name: category.name,
          icon: category.icon ?? '📦',
        } satisfies ExpenseReadCategory,
      ]),
    )
    const paymentsByExpense = new Map<string, ExpensePaymentDetail[]>()
    const splitsByExpense = new Map<string, ExpenseSplitDetail[]>()

    paymentsResult.data.forEach((payment) => {
      const payments = paymentsByExpense.get(payment.expense_id) ?? []
      payments.push({
        userId: payment.user_id,
        amount: Number(payment.amount),
        displayName: profilesById.get(payment.user_id) ?? 'Antiguo miembro',
      })
      paymentsByExpense.set(payment.expense_id, payments)
    })

    splitsResult.data.forEach((split) => {
      const splits = splitsByExpense.get(split.expense_id) ?? []
      splits.push({
        userId: split.user_id,
        sharePercent: split.share_percent === null ? null : Number(split.share_percent),
        shareAmount: Number(split.share_amount),
        displayName: profilesById.get(split.user_id) ?? 'Antiguo miembro',
      })
      splitsByExpense.set(split.expense_id, splits)
    })

    const members: ExpenseReadMember[] = membersResult.data.map((member) => ({
      userId: member.user_id,
      displayName: profilesById.get(member.user_id) ?? 'Miembro',
      role: member.role === 'owner' ? 'owner' : 'member',
    }))

    const expenses: ExpenseRecord[] = expensesResult.data.map((expense) => ({
      id: expense.id,
      householdId: expense.household_id,
      description: expense.description,
      amount: Number(expense.amount),
      expenseDate: expense.expense_date,
      expenseType: expense.expense_type === 'personal' ? 'personal' : 'common',
      personalOwnerId: expense.personal_owner_id,
      paymentSource: expense.payment_source === 'common_fund' ? 'common_fund' : 'member',
      note: expense.note ?? '',
      categoryId: expense.category_id,
      category: expense.category_id
        ? (categoriesById.get(expense.category_id) ?? {
            id: expense.category_id,
            name: 'Categoría no disponible',
            icon: '📦',
          })
        : { id: null, name: 'Sin categoría', icon: '📦' },
      payments: paymentsByExpense.get(expense.id) ?? [],
      splits: splitsByExpense.get(expense.id) ?? [],
      createdBy: expense.created_by,
      updatedBy: expense.updated_by,
      createdAt: expense.created_at,
      updatedAt: expense.updated_at,
    }))

    const settlements: SettlementRecord[] = settlementsResult.data.map((settlement) => ({
      id: settlement.id,
      householdId: settlement.household_id,
      fromUserId: settlement.from_user_id,
      toUserId: settlement.to_user_id,
      amount: Number(settlement.amount),
      settlementDate: settlement.settlement_date,
      note: settlement.note ?? '',
      createdBy: settlement.created_by,
      updatedBy: settlement.updated_by,
      createdAt: settlement.created_at,
      updatedAt: settlement.updated_at,
    }))

    return { expenses, members, settlements }
  } catch (error) {
    if (error instanceof ExpenseServiceError) throw error

    throw new ExpenseServiceError('No hemos podido cargar los gastos.')
  }
}

export async function loadExpenseFormData(householdId: string) {
  const [categoriesResult, membersResult] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, icon')
      .eq('household_id', householdId)
      .eq('archived', false)
      .order('name', { ascending: true }),
    supabase
      .from('household_members')
      .select('user_id, default_share, joined_at')
      .eq('household_id', householdId)
      .order('joined_at', { ascending: true }),
  ])

  if (categoriesResult.error) {
    throw new ExpenseServiceError('No hemos podido cargar las categorías del hogar.')
  }

  if (membersResult.error) {
    throw new ExpenseServiceError('No hemos podido cargar los miembros del hogar.')
  }

  if (!categoriesResult.data.length) {
    throw new ExpenseServiceError('El hogar no tiene categorías disponibles.')
  }

  if (!membersResult.data.length) {
    throw new ExpenseServiceError('El hogar no tiene miembros disponibles.')
  }

  const userIds = membersResult.data.map((member) => member.user_id)
  const profilesResult = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds)

  if (profilesResult.error) {
    throw new ExpenseServiceError('No hemos podido cargar los perfiles del hogar.')
  }

  const profilesById = new Map(
    profilesResult.data.map((profile) => [profile.id, profile.display_name]),
  )

  const missingProfile = userIds.some((userId) => !profilesById.has(userId))

  if (missingProfile) {
    throw new ExpenseServiceError('Falta el perfil de uno de los miembros del hogar.')
  }

  const categories: ExpenseCategory[] = categoriesResult.data.map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon ?? '📦',
  }))

  const members: ExpenseMember[] = membersResult.data.map((member) => ({
    userId: member.user_id,
    displayName: profilesById.get(member.user_id) ?? 'Miembro',
    defaultShare: Number(member.default_share),
  }))

  return { categories, members }
}

export async function createExpense(input: CreateExpenseInput) {
  const { data, error } = await supabase.rpc('create_expense_v2', {
    p_household_id: input.householdId,
    p_description: input.description,
    p_amount: input.amount,
    p_category_id: input.categoryId,
    p_expense_date: input.expenseDate,
    p_expense_type: input.expenseType,
    p_note: input.note || null,
    p_payment_source: input.paymentSource,
    p_paid_by_user_id: input.paidByUserId,
    p_payer_amount: input.payerAmount,
    p_splits: input.splits.map((split) => ({
      user_id: split.userId,
      share_percent: split.sharePercent,
      share_amount: split.shareAmount,
    })),
  })

  if (error) {
    const safeMessage = knownCreateExpenseErrors.find((message) => error.message.includes(message))

    throw new ExpenseServiceError(
      safeMessage ?? 'No hemos podido guardar el gasto. Inténtalo de nuevo.',
    )
  }

  if (typeof data !== 'string') {
    throw new ExpenseServiceError('El gasto se guardó, pero no recibimos su identificador.')
  }

  return data
}

export async function updateExpense(input: UpdateExpenseInput) {
  const { data, error } = await supabase.rpc('update_expense_v2', {
    p_expense_id: input.expenseId,
    p_description: input.description,
    p_amount: input.amount,
    p_category_id: input.categoryId,
    p_expense_date: input.expenseDate,
    p_expense_type: input.expenseType,
    p_note: input.note || null,
    p_payment_source: input.paymentSource,
    p_payments: input.payments.map((payment) => ({
      user_id: payment.userId,
      amount: payment.amount,
    })),
    p_splits: input.splits.map((split) => ({
      user_id: split.userId,
      share_percent: split.sharePercent,
      share_amount: split.shareAmount,
    })),
  })

  if (error) {
    const safeMessage = knownMutationErrors.find((message) => error.message.includes(message))

    throw new ExpenseServiceError(
      safeMessage ?? 'No hemos podido actualizar el gasto. Inténtalo de nuevo.',
    )
  }

  if (typeof data !== 'string') {
    throw new ExpenseServiceError('El gasto se actualizó, pero no recibimos su identificador.')
  }

  return data
}

export async function deleteExpense(expenseId: string) {
  const { data, error } = await supabase.rpc('delete_expense_v2', {
    p_expense_id: expenseId,
  })

  if (error) {
    const safeMessage = knownMutationErrors.find((message) => error.message.includes(message))

    throw new ExpenseServiceError(
      safeMessage ?? 'No hemos podido eliminar el gasto. Inténtalo de nuevo.',
    )
  }

  if (typeof data !== 'string') {
    throw new ExpenseServiceError('El gasto se eliminó, pero no recibimos su identificador.')
  }

  return data
}
