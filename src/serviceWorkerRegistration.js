// serviceWorkerRegistration.js

export function register() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {

     navigator.serviceWorker
  .register('/sw.js')
        .then((registration) => {

          console.log('SW registrado');

          // 🔥 FORZAR CACHE OFFLINE
          registration.update();

        })
        .catch((error) => {
          console.log('Error SW:', error);
        });

    });
  }
}