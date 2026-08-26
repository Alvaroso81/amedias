# Amedias

Tus gastos compartidos, en equilibrio.

### Deployment

La versión de producción se publica en GitHub Pages mediante el workflow:

`.github/workflows/deploy-pages.yml`

El build requiere estos repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
