# Corrección del cursor mensual (016)

## Diagnóstico reproducido localmente

Con septiembre confirmado, la 015 conserva como límite el antiguo cursor
`2026-10-06`. Al buscar fechas de la nueva regla (día 5), descarta tanto
el 5 de septiembre como el 5 de octubre, y devuelve el 5 de noviembre.
No necesita existir ninguna ocurrencia de octubre para producir ese resultado.
Cada dos meses, el mismo problema descarta noviembre y devuelve enero.

El trigger y `update_recurring_expense_v2` calculaban dos veces el mismo
resultado usando el mismo límite anterior. No eran dos avances sucesivos:
`ensure_recurring_occurrences` solo avanza fechas vencidas o de hoy, así que
en septiembre no materializa octubre ni noviembre.

La reproducción local completa creó Netflix el 6 de septiembre, confirmó
septiembre y editó al día 5 con la 015. Solo existía la ocurrencia confirmada
del 6 de septiembre, pero el cursor quedó en el 5 de noviembre. Aplicar la
016 corrigió ese cursor al 5 de octubre.

No se ha consultado producción ni ejecutado SQL remoto. El estado real de las
ocurrencias de octubre del usuario no está verificado. Si octubre ya estuviera
materializado, noviembre podría ser correcto.

## Regla de edición mensual

Una ocurrencia existente reserva su ciclo, sea pending, confirmed o skipped.
Al cambiar la regla se busca la primera fecha de la nueva serie que:

- sea estrictamente posterior a hoy, según Europe/Madrid;
- esté a partir del mes de la última ocurrencia más el nuevo intervalo mensual.

La nueva start_date fija la fase de la serie. Por ejemplo, cada dos meses desde
septiembre conserva septiembre → noviembre → enero. La función de fechas
existente mantiene los anclajes 31 enero → 28/29 febrero → 31 marzo.

| Situación al editar | Resultado |
| --- | --- |
| Hoy 6 septiembre; septiembre confirmado; 6 → 5 | 5 octubre |
| Hoy 6 septiembre; septiembre confirmado; 6 → 10 | 10 octubre |
| Hoy 6 septiembre; septiembre sin materializar; nueva fecha 10 septiembre | 10 septiembre |
| Hoy 21 septiembre; septiembre consumido; 20 → 5 | 5 octubre |
| Cada dos meses desde septiembre; septiembre consumido; 6 → 5 | 5 noviembre |
| Octubre ya pending, skipped o confirmed; nueva regla mensual día 5 | 5 noviembre |

La edición recalcula el cursor una sola vez, en el trigger compartido con la
RPC antigua. La RPC v2 mantiene las validaciones y el refresco de pendientes.
Guardar sin cambiar la regla no recalcula el cursor. Las reglas semanales y
anuales mantienen su comportamiento anterior.

La 016 también repara cursores mensuales futuros adelantados basándose en el
historial materializado y la regla actual. Solo los acerca si existe una fecha
futura válida anterior. No modifica ocurrencias, gastos, plantillas eliminadas,
cursores ya vencidos ni indicadores de pausa/actividad.

## Presentación e historial

El detalle deja de mostrar “Prevista”. Se conservan due_date, snapshots y la
relación expense ↔ occurrence. La regla actual, próxima fecha y gestión de
recurrencia permanecen visibles.

## Verificación

`supabase/tests/016_recurring_next_due_fix.sql` es una prueba para una base
local desechable con 001–016 aplicadas. Usa fechas controladas, ejecuta las RPC
reales y revierte sus fixtures y reloj al terminar. Cubre A–F, cambios hacia
atrás y adelante, intervalos, meses cortos, todos los estados de octubre,
refrescos repetidos, snapshots, gastos confirmados, pausa/reactivación,
eliminación y permisos de ejecución.
