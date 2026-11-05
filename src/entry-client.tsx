import { hydrateRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';

hydrateRoot(document.getElementById('root')!, <App path={location.pathname} />);
