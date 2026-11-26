/**
 * Ponto de entrada do painel: carrega os estilos e inicia a aplicação.
 */
import './styles/base.css';
import './styles/painel.css';
import { iniciarApp } from './ui/app';

const raiz = document.querySelector<HTMLElement>('#app');
if (raiz) iniciarApp(raiz);
