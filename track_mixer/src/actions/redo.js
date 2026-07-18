import { stepHistory } from '../state/history';

export const redo = () => stepHistory('redo');
