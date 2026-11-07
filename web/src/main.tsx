import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { startUpdates } from './update';

startUpdates();
createRoot(document.getElementById('root')!).render(<App />);
