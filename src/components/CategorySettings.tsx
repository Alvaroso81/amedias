import './CategorySettings.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const [categories, setCategories] = useState<HouseholdCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null)
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
  const draggedCategory = activeCategories.find(({ id }) => id === draggedCategoryId)
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

  const handleDragStart = ({ active }: DragStartEvent) => {
    setDraggedCategoryId(String(active.id))
    setOperationError(null)
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setDraggedCategoryId(null)
    if (!over || active.id === over.id || isBusy) return

    const previousCategories = categories
    const previousIndex = activeCategories.findIndex(({ id }) => id === active.id)
    const nextIndex = activeCategories.findIndex(({ id }) => id === over.id)
    if (previousIndex < 0 || nextIndex < 0) return

    const reorderedActive = arrayMove(activeCategories, previousIndex, nextIndex).map(
      (category, sortOrder) => ({ ...category, sortOrder }),
    )
    const reorderedCategories = [...reorderedActive, ...inactiveCategories]

    setCategories(reorderedCategories)
    setBusyAction(`reorder:${active.id}`)
    setOperationError(null)

    try {
      await reorderCategories(householdId, reorderedActive.map(({ id }) => id))
    } catch (error) {
      setCategories(previousCategories)
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragCancel={() => setDraggedCategoryId(null)}
            onDragEnd={(event) => void handleDragEnd(event)}
          >
            <SortableContext
              items={activeCategories.map(({ id }) => id)}
              strategy={verticalListSortingStrategy}
            >
              <ul
                className="category-settings-list category-settings-list--active"
                aria-label="Categorías activas ordenables"
              >
                {activeCategories.map((category) => (
                  <SortableCategoryRow
                    category={category}
                    disabled={isBusy}
                    canDeactivate={activeCategories.length > 1}
                    isDeactivating={busyAction === `deactivate:${category.id}`}
                    key={category.id}
                    onEdit={() => {
                      setOperationError(null)
                      setEditor({ mode: 'edit', category })
                    }}
                    onDeactivate={() => void handleActiveChange(category, false)}
                  />
                ))}
              </ul>
            </SortableContext>
            <DragOverlay>
              {draggedCategory ? <CategoryDragOverlay category={draggedCategory} /> : null}
            </DragOverlay>
          </DndContext>

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

function CategoryDragOverlay({ category }: { category: HouseholdCategory }) {
  return (
    <div className="category-drag-overlay" aria-hidden="true">
      <span className="category-drag-overlay-handle">⠿</span>
      <span className="category-settings-icon">{category.icon}</span>
      <div className="category-settings-copy">
        <strong>{category.name}</strong>
        <span>Activa</span>
      </div>
    </div>
  )
}

type SortableCategoryRowProps = {
  category: HouseholdCategory
  disabled: boolean
  canDeactivate: boolean
  isDeactivating: boolean
  onEdit: () => void
  onDeactivate: () => void
}

function SortableCategoryRow({
  category,
  disabled,
  canDeactivate,
  isDeactivating,
  onEdit,
  onDeactivate,
}: SortableCategoryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      className={isDragging ? 'category-settings-row--dragging' : undefined}
      ref={setNodeRef}
      style={style}
    >
      <button
        className="category-drag-handle"
        type="button"
        disabled={disabled}
        {...attributes}
        {...listeners}
        aria-label={`Mover categoría ${category.name}`}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <span className="category-settings-icon" aria-hidden="true">{category.icon}</span>
      <div className="category-settings-copy">
        <strong>{category.name}</strong>
        <span>Activa</span>
      </div>
      <div className="category-settings-actions">
        <button type="button" disabled={disabled} onClick={onEdit}>
          Editar
        </button>
        <button
          className="category-settings-danger"
          type="button"
          disabled={disabled || !canDeactivate}
          title={!canDeactivate ? 'Debe quedar al menos una categoría activa' : undefined}
          onClick={onDeactivate}
        >
          {isDeactivating ? 'Desactivando…' : 'Desactivar'}
        </button>
      </div>
    </li>
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
