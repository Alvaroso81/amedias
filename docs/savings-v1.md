# Ahorros V1

La migración 017 añade un libro de movimientos independiente de gastos,
balance, fondo común, liquidaciones, estadísticas y recurrentes.
No se ha aplicado SQL remoto.

## Acceso y reglas

- Personal: propietario y aportante derivados de auth.uid(), nunca de una
  selección del cliente. Solo el propietario, mientras pertenece al hogar,
  puede consultar o gestionar el objetivo y sus relaciones.
- Compartido: solo participantes que pertenezcan al hogar pueden consultar
  o gestionar el objetivo. El creador debe incluirse y un editor mantiene
  su participación. Un miembro del hogar no participante no ve filas ni counts.
- Porcentajes enteros 0–100, sin duplicar usuarios, suma exactamente 100.
  Cualquier movimiento fija el reparto; desde entonces la edición solo
  cambia nombre, objetivo y fecha.
- Aportaciones positivas y retiradas positivas se guardan en céntimos bigint.
  El saldo es aportaciones menos retiradas. El histórico por persona suma
  únicamente aportaciones y permanece intacto tras retiradas.
- Todas las mutaciones usan RPC con SECURITY DEFINER y search_path vacío.
  No hay permisos DML del cliente. Las tres tablas se leen mediante RLS.
- Todas las mutaciones bloquean el mismo objetivo. La retirada obtiene el
  bloqueo antes de calcular el saldo y rechaza importes superiores al disponible.
- Archivar conserva datos y bloquea nuevos movimientos/edición hasta reactivar.
  No existe borrado definitivo.

Los cálculos frontend mantienen céntimos bigint. El objetivo proporcional
usa el método del mayor resto; los empates se resuelven por identificador de
usuario, de forma determinista. Solo se convierten a número los porcentajes
de progreso para presentarlos.

## Navegación

El botón central + abre Gasto / Ahorro. Gasto conserva su ruta y formulario;
Ahorro abre directamente Nuevo ahorro. Inicio y Ajustes abren la lista.
La navegación inferior mantiene cinco botones.

Inicio suma objetivos activos compartidos visibles y muestra los personales
por separado. Los archivados aparecen en su propia sección. Tras guardar un
objetivo o movimiento se recarga únicamente el estado de Ahorros.

## Validación local

Aplicadas 001–017 desde cero sobre PostgreSQL local con autenticación simulada.

- supabase/tests/017_savings.sql: matriz A–M y O–R, roles authenticated/anon,
  privacidad personal y compartida, reparto inválido, miembro ajeno, edición,
  archivo y ausencia de efectos en las tablas financieras existentes.
- supabase/tests/017_savings_concurrency.mjs: caso N con dos procesos psql.
  Sobre 100 €, dos retiradas concurrentes de 80 €: una aceptada, otra
  rechazada y saldo final 20 €.
- tests/savings.test.mjs: importes exactos, históricos y restos por céntimos.
- tests/savings-ui.test.mjs: render real de componentes (selector, cinco
  botones, resumen separado, lista y progreso). No simula clicks ni viewports.

Ejecutar los tests de componentes/cálculos con:

```sh
node --test tests/savings.test.mjs tests/savings-ui.test.mjs
```

Los tests SQL y de concurrencia son exclusivamente para una base local
desechable que contenga las migraciones completas. El test SQL revierte sus
fixtures. El concurrente deja sus fixtures en la base desechable.

## Revisión manual pendiente

No hubo navegador conectado disponible. Queda ejecutar el flujo interactivo
completo: + → Gasto/Ahorro, crear personal/compartido 30/70, aportar, retirar,
editar, archivar/reactivar y cambiar de usuario. Revisar teclado/foco y los
anchos 360, 375, 390, 393, 412 y 430 px, además de escritorio/iMac.

Antes de publicar el frontend debe estar aplicada la migración 017.
