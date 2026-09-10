/// <reference types="vite/client" />

/**
 * Variáveis de ambiente lidas no build da interface.
 *
 * `VITE_API_URL` só é necessária quando a interface e a API ficam em origens
 * diferentes (por exemplo, site estático e serviço web separados na Render).
 * Em desenvolvimento e no Docker Compose a origem é a mesma e o padrão `/api`
 * resolve — por isso a variável é opcional.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
