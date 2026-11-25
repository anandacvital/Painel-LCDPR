/**
 * Ponto de entrada do painel: carrega os estilos e monta a tela inicial.
 */
import './styles/base.css';
import { montarTelaInicial } from './ui/telaInicial';

const raiz = document.querySelector<HTMLElement>('#app');
if (raiz) montarTelaInicial(raiz);
