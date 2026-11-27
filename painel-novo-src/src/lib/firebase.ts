// Mesma configuração do firebase.js do site: mesma origem e mesmo app → a sessão do painel antigo vale aqui.
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const CONFIG = { apiKey: 'AIzaSyCXB5TxyhhAZUM6O5JbQwmh-_MBzrxUhvE', projectId: 'pede-direto-app', appId: '1:413453137627:web:4420b6f646e6841d43fefe', messagingSenderId: '413453137627' };
const RECAPTCHA = '6LcelNgtAAAAAId66pZ62ryihSVlKg6vpOP8N-Q2';
export const LOJA_ID = 'lacarne';
export const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const app = initializeApp(LOCAL ? { projectId: 'demo-lacarne', apiKey: 'demo' } : { ...CONFIG, authDomain: location.host });
export const appCheck = !LOCAL && RECAPTCHA ? initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA), isTokenAutoRefreshEnabled: true }) : null;
export const db = getFirestore(app);
export const auth = getAuth(app);
if (LOCAL) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
