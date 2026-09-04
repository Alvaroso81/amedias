import './CategorySettings.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  CategoryServiceError,
  createCategory,
  getCategories,
  reorderCategories,
  setCategoryActive,
  updateCategory,
} from '../services/categories'
import type { CategoryMutationInput, HouseholdCategory } from '../types/category'

type CategorySettingsProps = {
  householdId: string
  onCategoriesChanged: () => void | Promise<unknown>
}

type CategoryEditor =
  | { mode: 'create' }
  | { mode: 'edit'; category: HouseholdCategory }
  | null

const emojiSuggestions = ['🛒', '🍽️', '🏠', '👕', '👦', '🎬', '🚗', '✈️', '💡', '📦', '🐾', '💊']

export function CategorySettings({
  householdId,
  onCategoriesChanged,
}: CategorySettingsProps) {
  const requestId = useRef(0)
  const [categories, setCategories] = useState<HouseholdCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [editor, setEditor] = useState<CategoryEditor>(null)
  const [showInactive, setShowInactive] = useState(false)

  const loadCategories = useCallback(async (showLoading = true) => {
    const currentRequest = ++requestId.current
    if (showLoading) setLoading(true)
    setLoadError(null)

    try {
      const loadedCategories = await getCategories(householdId)
      if (currentRequest !== requestId.current) return

      setCategories(loadedCategories)
      setLoading(false)
    } catch (error) {
      if (currentRequest !== requestId.current) return

      setLoadError(
        error instanceof CategoryServiceError
          ? error.message
          : 'No hemos podido cargar las categorías del hogar.',
      )
      setLoading(false)
    }
  }, [householdId])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadCategories(), 0)

    return () => {
      window.clearTimeout(loadTimer)
      requestId.current += 1
    }
  }, [loadCategories])

  const refreshAfterMutation = async () => {
    await Promise.all([loadCategories(false), onCategoriesChanged()])
  }

  const activeCategories = categories.filter((category) => category.isActive)
  const inactiveCategories = categories.filter((category) => !category.isActive)
  const isBusy = busyAction !== null

  const handleSave = async (input: CategoryMutationInput) => {
    setBusyAction('save')
    setOperationError(null)

    try {
      if (editor?.mode === 'edit') {
        await updateCategory(editor.category.id, input)
      } else {
        await createCategory(householdId, input)
      }

      await refreshAfterMutation()
      setEditor(null)
    } finally {
      setBusyAction(null)
    }
  }

  const handleActiveChange = async (category: HouseholdCategory, isActive: boolean) => {
    setBusyAction(`${isActive ? 'activate' : 'deactivate'}:${category.id}`)
    setOperationError(null)

    try {
      await setCategoryActive(category.id, isActive)
      await refreshAfterMutation()
    } catch (error) {
      setOperationError(
        error instanceof CategoryServiceError
          ? error.message
          : 'No hemos podido actualizar la categoría.',
      )
    } finally {
      setBusyAction(null)
    }
  }

  const handleMove = async (categoryIndex: number, offset: -1 | 1) => {
    const targetIndex = categoryIndex + offset
    if (targetIndex < 0 || targetIndex >= activeCategories.length) return

    const reordered = [...activeCategories]
    const [category] = reordered.splice(categoryIndex, 1)
    reordered.splice(targetIndex, 0, category)

    setBusyAction(`reorder:${category.id}`)
    setOperationError(null)

    try {
      await reorderCategories(householdId, reordered.map(({ id }) => id))
      await refreshAfterMutation()
    } catch (error) {
      setOperationError(
        error instanceof CategoryServiceError
          ? error.message
          : 'No hemos podido guardar el orden de las categorías.',
      )
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="card settings-card category-settings" aria-labelledby="category-settings-title">
      <div className="settings-section-heading category-settings-heading">
        <div>
          <span>Organización</span>
          <h2 id="category-settings-title">Categorías</h2>
        </div>
        <button
          className="settings-inline-button"
          type="button"
          disabled={isBusy}
          aria-expanded={editor?.mode === 'create'}
          onClick={() => {
            setOperationError(null)
            setEditor(editor?.mode === 'create' ? null : { mode: 'create' })
          }}
        >
          {editor?.mode === 'create' ? 'Cerrar' : '+ Nueva categoría'}
        </button>
      </div>
      <p className="category-settings-intro">
        El orden se utiliza al registrar gastos. Desactivar una categoría no modifica el histórico.
      </p>

      {editor && (
        <CategoryForm
          key={editor.mode === 'edit' ? editor.category.id : 'new-category'}
          category={editor.mode === 'edit' ? editor.category : undefined}
          onCancel={() => setEditor(null)}
          onSave={handleSave}
        />
      )}

      {loading ? (
        <div className="settings-loading" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          Cargando categorías…
        </div>
      ) : loadError ? (
        <div className="settings-load-error" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => void loadCategories()}>
            Volver a intentar
          </button>
        </div>
      ) : (
        <>
          <ul className="category-settings-list" aria-label="Categorías activas">
            {activeCategories.map((category, index) => (
              <li key={category.id}>
                <span className="category-settings-icon" aria-hidden="true">{category.icon}</span>
                <div className="category-settings-copy">
                  <strong>{category.name}</strong>
                  <span>Activa</span>
                </div>
                <div className="category-settings-actions">
                  <button
                    type="button"
                    disabled={isBusy || index === 0}
                    aria-label={`Subir ${category.name}`}
                    title="Subir"
                    onClick={() => void handleMove(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || index === activeCategories.length - 1}
                    aria-label={`Bajar ${category.name}`}
                    title="Bajar"
                    onClick={() => void handleMove(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setOperationError(null)
                      setEditor({ mode: 'edit', category })
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="category-settings-danger"
                    type="button"
                    disabled={isBusy || activeCategories.length === 1}
                    title={activeCategories.length === 1 ? 'Debe quedar al menos una categoría activa' : undefined}
                    onClick={() => void handleActiveChange(category, false)}
                  >
                    {busyAction === `deactivate:${category.id}` ? 'Desactivando…' : 'Desactivar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {inactiveCategories.length > 0 && (
            <div className="inactive-categories">
              <button
                className="inactive-categories-toggle"
                type="button"
                aria-expanded={showInactive}
                aria-controls="inactive-category-list"
                onClick={() => setShowInactive((isVisible) => !isVisible)}
              >
                {showInactive ? 'Ocultar' : 'Ver'} categorías inactivas ({inactiveCategories.length})
                <span aria-hidden="true">{showInactive ? '⌃' : '⌄'}</span>
              </button>

              {showInactive && (
                <ul className="category-settings-list category-settings-list--inactive" id="inactive-category-list">
                  {inactiveCategories.map((category) => (
                    <li key={category.id}>
                      <span className="category-settings-icon" aria-hidden="true">{category.icon}</span>
                      <div className="category-settings-copy">
                        <strong>{category.name}</strong>
                        <span>Inactiva · disponible en el histórico</span>
                      </div>
                      <div className="category-settings-actions">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setOperationError(null)
                            setEditor({ mode: 'edit', category })
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleActiveChange(category, true)}
                        >
                          {busyAction === `activate:${category.id}` ? 'Reactivando…' : 'Reactivar'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {operationError && <p className="auth-submit-error" role="alert">{operationError}</p>}
    </section>
  )
}

type CategoryFormProps = {
  category?: HouseholdCategory
  onCancel: () => void
  onSave: (input: CategoryMutationInput) => Promise<void>
}

function CategoryForm({ category, onCancel, onSave }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '📦')
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedIcon = icon.trim()

    if (!normalizedName) {
      setNameError('Introduce un nombre')
      return
    }

    if (normalizedName.length > 80) {
      setNameError('El nombre no puede superar los 80 caracteres')
      return
    }

    if (Array.from(normalizedIcon).length > 16) {
      setSubmitError('El icono es demasiado largo')
      return
    }

    setIsSaving(true)
    setNameError(null)
    setSubmitError(null)

    try {
      await onSave({ name: normalizedName, icon: normalizedIcon })
    } catch (error) {
      setSubmitError(
        error instanceof CategoryServiceError
          ? error.message
          : 'No hemos podido guardar la categoría.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="category-editor" onSubmit={handleSubmit} noValidate>
      <div className="form-field">
        <label htmlFor="category-editor-name">Nombre</label>
        <input
          autoFocus
          id="category-editor-name"
          type="text"
          maxLength={80}
          value={name}
          autoComplete="off"
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? 'category-editor-name-error' : undefined}
          onChange={(event) => {
            setName(event.target.value)
            setNameError(null)
            setSubmitError(null)
          }}
        />
        {nameError && <p className="field-error" id="category-editor-name-error">{nameError}</p>}
      </div>

      <fieldset className="category-icon-field">
        <legend>Icono</legend>
        <div className="category-icon-input-row">
          <input
            type="text"
            value={icon}
            aria-label="Icono de la categoría"
            onChange={(event) => {
              setIcon(event.target.value)
              setSubmitError(null)
            }}
          />
          <span aria-hidden="true">{icon.trim() || '📦'}</span>
        </div>
        <div className="category-emoji-suggestions" aria-label="Iconos sugeridos">
          {emojiSuggestions.map((suggestedIcon) => (
            <button
              className={icon === suggestedIcon ? 'category-emoji-suggestion--active' : undefined}
              type="button"
              aria-label={`Usar ${suggestedIcon}`}
              aria-pressed={icon === suggestedIcon}
              key={suggestedIcon}
              onClick={() => setIcon(suggestedIcon)}
            >
              {suggestedIcon}
            </button>
          ))}
        </div>
      </fieldset>

      {submitError && <p className="auth-submit-error" role="alert">{submitError}</p>}

      <div className="category-editor-actions">
        <button type="button" disabled={isSaving} onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={isSaving}>
          {isSaving
            ? 'Guardando…'
            : category
              ? 'Guardar cambios'
              : 'Crear categoría'}
        </button>
      </div>
    </form>
  )
}
