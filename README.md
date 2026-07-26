# mira

Dashboard operativo multi-cultivo para invernaderos.

## Preparacion local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env.local` a partir de `.env.example` y pega las llaves publicas de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-publica
```

3. Levanta Supabase local y aplica la cadena de migraciones desde cero:

```bash
supabase start
supabase db reset --local
```

`supabase/migrations/` es la única fuente de verdad para una instalación nueva. Los SQL numerados en la raíz se conservan como historial de despliegues manuales, no como una segunda cadena de migración.

4. Crea usuarios desde la app:

- Si alguien entra sin invitación, puede crear su cuenta y completar el onboarding para crear su empresa como `owner`.
- Si alguien fue invitado, debe crear cuenta o entrar con el mismo correo invitado; Mira acepta la invitación automáticamente al iniciar sesión.

5. Levanta la app:

```bash
npm run dev
```

## Checklist antes de usar en produccion

Corre este comando antes de desplegar:

```bash
npm run check
```

Ese comando valida lint, TypeScript, pruebas unitarias y build de Next.js. Para repetir el control completo de CI en local, incluyendo la auditoría de dependencias de producción:

```bash
npm run check:ci
```

Para validar Supabase desde una base limpia y ejecutar las regresiones de RLS, Work, inventario y multiempresa (requiere Docker):

```bash
npm run test:db
```

GitHub Actions ejecuta ambos controles en cada pull request y en cada cambio a `main`.

En el proveedor de deploy configura estas variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Antes de probar con datos reales, sigue el runbook de pre-produccion en `docs/pre-production-runbook.md` y corre el diagnostico de solo lectura:

```text
supabase/29_pre_production_checks.sql
```

Para activar Mira Copilot configura el secreto de OpenAI y despliega la función:

```bash
supabase secrets set OPENAI_API_KEY=sk-proj_...
supabase secrets set OPENAI_COPILOT_MODEL=gpt-5.5
supabase functions deploy mira-copilot
supabase functions deploy mira-chat
```

No subas archivos `.env` reales. Usa `.env.example` solo como plantilla.
