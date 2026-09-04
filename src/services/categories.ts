import { supabase } from './supabase'
import type { CategoryMutationInput, HouseholdCategory } from '../types/category'

const categoryErrorMessages = {
  CATEGORY_AUTH_REQUIRED: 'Debes iniciar sesión para gestionar categorías.',
  CATEGORY_ACCESS_DENIED: 'No tienes acceso a esta categoría.',
  CATEGORY_NAME_REQUIRED: 'El nombre de la categoría es obligatorio.',
  CATEGORY_NAME_TOO_LONG: 'El nombre no puede superar los 80 caracteres.',
  CATEGORY_ICON_TOO_LONG: 'El icono es demasiado largo.',
  CATEGORY_DUPLICATE: 'Ya existe una categoría con ese nombre.',
  CATEGORY_LAST_ACTIVE: 'Debe quedar al menos una categoría activa.',
  CATEGORY_REORDER_INVALID: 'No hemos podido guardar el orden de las categorías.',
} as const

export class CategoryServiceError extends Error {}

function getCategoryError(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : String(error ?? '')
  const knownCode = Object.keys(categoryErrorMessages).find((code) =>
    message.includes(code),
  ) as keyof typeof categoryErrorMessages | undefined

  return new CategoryServiceError(knownCode ? categoryErrorMessages[knownCode] : fallback)
}

export async function getCategories(householdId: string) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, household_id, name, icon, archived, sort_order')
    .eq('household_id', householdId)
    .order('archived', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw getCategoryError(error, 'No hemos podido cargar las categorías del hogar.')
  }

  return data.map((category): HouseholdCategory => ({
    id: category.id,
    householdId: category.household_id,
    name: category.name,
    icon: category.icon?.trim() || '📦',
    isActive: !category.archived,
    sortOrder: category.sort_order,
  }))
}

export async function createCategory(
  householdId: string,
  input: CategoryMutationInput,
) {
  const { data, error } = await supabase.rpc('create_category', {
    p_household_id: householdId,
    p_name: input.name,
    p_icon: input.icon || null,
  })

  if (error || typeof data !== 'string') {
    throw getCategoryError(error, 'No hemos podido crear la categoría.')
  }

  return data
}

export async function updateCategory(
  categoryId: string,
  input: CategoryMutationInput,
) {
  const { data, error } = await supabase.rpc('update_category', {
    p_category_id: categoryId,
    p_name: input.name,
    p_icon: input.icon || null,
  })

  if (error || typeof data !== 'string') {
    throw getCategoryError(error, 'No hemos podido actualizar la categoría.')
  }

  return data
}

export async function setCategoryActive(categoryId: string, isActive: boolean) {
  const { data, error } = await supabase.rpc('set_category_active', {
    p_category_id: categoryId,
    p_active: isActive,
  })

  if (error || typeof data !== 'string') {
    throw getCategoryError(
      error,
      isActive
        ? 'No hemos podido reactivar la categoría.'
        : 'No hemos podido desactivar la categoría.',
    )
  }

  return data
}

export async function reorderCategories(householdId: string, categoryIds: string[]) {
  const { data, error } = await supabase.rpc('reorder_categories', {
    p_household_id: householdId,
    p_category_ids: categoryIds,
  })

  if (error || typeof data !== 'number') {
    throw getCategoryError(error, 'No hemos podido guardar el orden de las categorías.')
  }

  return data
}
