# Recuperación de contraseña

La pantalla de acceso incluye «¿Olvidaste tu contraseña?». Envía una solicitud con `resetPasswordForEmail` y una confirmación genérica que no revela si existe la cuenta. El enlace abre un formulario con nueva contraseña y confirmación; `updateUser({ password })` usa la sesión validada por Supabase. No se necesita la contraseña anterior ni una clave administrativa.

La aplicación captura el modo de recuperación antes de que el SDK consuma el fragmento de la URL. Reconoce también enlaces enviados desde «Send password recovery» del panel, siempre que la Site URL apunte a Amedias. El marcador `?password-recovery=1` permite recargar sin abandonar el formulario. Es solo navegación: la autorización sigue dependiendo de Supabase. Los callbacks inválidos no pueden reutilizar una sesión previa para mostrar el formulario. No se añaden copias de tokens ni contraseñas al almacenamiento o a logs.

## Configuración de Supabase

En Authentication → URL Configuration:

- **Site URL**: la URL de producción de Amedias, incluyendo `/amedias/` y la barra final.
- **Redirect URLs**: permitir la URL exacta `https://alvaroso81.github.io/amedias/?password-recovery=1` si esa es la URL de producción en uso. Para otro dominio, utilizar ese origen y la ruta base configurada en Vite.
- En desarrollo, permitir el equivalente con el origen y puerto local solo si se va a probar un correo real.

La plantilla de recuperación debe conservar el enlace de confirmación generado por Supabase (`{{ .ConfirmationURL }}`). No sustituirlo por un enlace directo a la web: se perdería la validación. La entrega depende de la configuración de correo, sus límites y el SMTP del proyecto.

La configuración remota no se modifica automáticamente. Publicar estos cambios antes de enviar a los usuarios nuevos enlaces de recuperación.

## Validación

- `node --test tests/*.test.mjs`
- `npm run lint`
- `npm run build`
- Prueba en navegador con Supabase simulado: solicitud válida, correo inválido, error de envío, recuperación válida, contraseña no coincidente, error al guardar, éxito, recarga y enlaces caducados o malformados con sesión anterior.
- Prueba real pendiente: correo recibido, apertura del enlace en el navegador de destino, cambio de contraseña y acceso posterior. No enviar correos ni modificar cuentas reales durante las pruebas automatizadas.

Referencias: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail y https://supabase.com/docs/guides/auth/redirect-urls.

### Repetir la prueba de navegador

Requiere Playwright y Chrome ya instalados; no añade dependencias a la aplicación. Arrancar un servidor aislado:

```sh
VITE_SUPABASE_URL=https://amedias-auth.test VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

En otra terminal:

```sh
node tests/password-recovery.browser.mjs
```

Si Playwright se encuentra fuera del proyecto, indicar `PLAYWRIGHT_MODULE` con la ruta absoluta a su `index.mjs`. La prueba bloquea destinos externos y simula la API en `amedias-auth.test`. Genera capturas en `/tmp/amedias-recovery-*.png` a 360, 390, 430 y 1280 px; no equivale a una prueba en móviles físicos.
