import { MASTER_ID } from '../state/store';
import Lane from './Lane';
import Meter from './Meter';

export default function MasterRow() {
  return (
    <div className="row">
      <div className="head">
        <div className="name" style={{ color: '#ffd75e' }}>MASTER</div>
        <Meter />
      </div>
      <div className="lane">
        <Lane laneId={MASTER_ID} kind="master" />
      </div>
    </div>
  );
}
