import { stepHistory } from '../state/history';

export const undo = () => stepHistory('undo');
