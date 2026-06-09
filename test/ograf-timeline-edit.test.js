import { describe, it, expect } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';

/**
 * GAP-B.2 Advanced keyframe-editing model API.
 *
 * The Timeline panel UI is DOM-heavy (drag, playhead, focus) and is hard to
 * exercise faithfully in jsdom, so these tests cover the load-bearing model
 * seam the UI calls: addKeyframe / removeKeyframe / moveKeyframe /
 * updateKeyframe / setLaneDelay. They assert the two contracts the UI relies
 * on: (1) every edit marks the lane custom (the Simple/Advanced guardrail),
 * and (2) actionDurations follows the edited timeline.
 */

function freshTemplate() {
    return OGrafTemplate.createFromType('lower-third', 'edit-test', 'Edit Test', 'd');
}

describe('Advanced keyframe editing marks lanes custom and updates durations', () => {
    it('addKeyframe inserts, sorts by time, marks the lane custom', () => {
        const t = freshTemplate();
        const id = t.elements[0].id;
        // Reset to an empty lane to test insertion from scratch.
        const lane = t.getLane(id, 'in');
        lane.keyframes = [];
        lane.custom = false;

        t.addKeyframe(id, 'in', 800, { opacity: 1, tx: 0, ty: 0, scale: 1 });
        t.addKeyframe(id, 'in', 0, { opacity: 0 });

        const edited = t.getLane(id, 'in');
        expect(edited.custom).toBe(true);
        expect(edited.keyframes.map(k => k.t)).toEqual([0, 800]); // sorted
        expect(edited.keyframes[0].props.opacity).toBe(0);
    });

    it('addKeyframe drops empty/non-finite props and coerces numbers', () => {
        const t = freshTemplate();
        const id = t.elements[0].id;
        const kf = t.addKeyframe(id, 'in', 100, { opacity: '0.5', tx: '', ty: null, scale: 'x' });
        expect(kf.props.opacity).toBe(0.5);
        expect('tx' in kf.props).toBe(false);
        expect('ty' in kf.props).toBe(false);
        expect('scale' in kf.props).toBe(false);
    });

    it('moveKeyframe clamps so it cannot cross neighbours or go below 0', () => {
        const t = freshTemplate();
        const id = t.elements[0].id;
        const lane = t.getLane(id, 'in');
        lane.keyframes = [
            { t: 0, props: {}, easing: 'linear' },
            { t: 250, props: {}, easing: 'linear' },
            { t: 500, props: {}, easing: 'linear' }
        ];
        // Try to drag the middle frame past the last one -> clamps to 500.
        t.moveKeyframe(id, 'in', 1, 9999);
        expect(t.getLane(id, 'in').keyframes[1].t).toBe(500);
        // Try to drag the first frame below 0 -> clamps to 0.
        t.moveKeyframe(id, 'in', 0, -100);
        expect(t.getLane(id, 'in').keyframes[0].t).toBe(0);
        expect(t.getLane(id, 'in').custom).toBe(true);
    });

    it('updateKeyframe sets/removes props and a valid easing', () => {
        const t = freshTemplate();
        const id = t.elements[0].id;
        const lane = t.getLane(id, 'in');
        lane.keyframes = [{ t: 0, props: { opacity: 1 }, easing: 'linear' }];
        lane.custom = false;

        t.updateKeyframe(id, 'in', 0, { opacity: '', scale: 1.5, easing: 'ease-in-out' });
        const kf = t.getLane(id, 'in').keyframes[0];
        expect('opacity' in kf.props).toBe(false); // empty removes it
        expect(kf.props.scale).toBe(1.5);
        expect(kf.easing).toBe('ease-in-out');
        expect(t.getLane(id, 'in').custom).toBe(true);
    });

    it('setLaneDelay clamps to >= 0 and marks custom', () => {
        const t = freshTemplate();
        const id = t.elements[0].id;
        expect(t.setLaneDelay(id, 'out', -50)).toBe(0);
        expect(t.setLaneDelay(id, 'out', 120)).toBe(120);
        expect(t.getLane(id, 'out').custom).toBe(true);
    });

    it('editing a keyframe time, then updateActionDurations, updates the declared duration', () => {
        const t = freshTemplate();
        const id = t.elements[0].id;
        const lane = t.getLane(id, 'in');
        // Push the last in-keyframe out to 1500ms via the edit API.
        const lastIndex = lane.keyframes.length - 1;
        t.moveKeyframe(id, 'in', lastIndex, 1500);
        t.updateActionDurations();
        const play = t.manifest.actionDurations.find(d => d.type === 'playAction');
        expect(play.duration).toBe(1500);
    });

    it('a lane delay contributes to the declared duration (delay + last keyframe)', () => {
        const t = freshTemplate();
        const id = t.elements[0].id;
        // Default in lane ends at 500ms; add a 300ms delay -> total 800ms.
        t.setLaneDelay(id, 'in', 300);
        t.updateActionDurations();
        const play = t.manifest.actionDurations.find(d => d.type === 'playAction');
        expect(play.duration).toBe(800);
    });
});
