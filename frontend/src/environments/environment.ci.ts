// CI-only build target. Used exclusively by `ng build --configuration=ci`,
// which runs in the GitHub Actions e2e job where the backend listens on :3000.
// The production build (environment.ts) keeps the relative '/api/v1' for the
// real nginx reverse-proxy deployment; this file is never used outside CI.
export const environment = {
  production: true,
  apiUrl: 'http://localhost:3000/api/v1',
  socketUrl: 'http://localhost:3000',
  withCredentials: true,
};
