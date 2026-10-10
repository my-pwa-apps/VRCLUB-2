'use strict';

/** A canonical room-time round, independent of local rendering, visible guests and the host. */
class MinglerClock {
    static DRINK_STAGES = [
        ['order', 2.5, 0], ['serve', 1.2, 0], ['served', 1.8, 0],
        ['pickup', 0.8, 0], ['drink', 1.9, 1], ['return', 0.9, 1], ['returned', 7, 1],
        ['pickup', 0.8, 1], ['drink', 1.9, 2], ['return', 0.9, 2], ['returned', 7, 2], ['clear', 1.2, 2]
    ];

    constructor(route, seed, surface, partnerPosition) {
        this.route = route;
        this.segments = [];
        this.result = {};
        let randomState = seed >>> 0;
        const random = () => {
            randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
            return randomState / 4294967296;
        };
        const duration = range => range.min + random() * (range.max - range.min);
        let node = route.home, dir = 1, level = surface(route.nodes[node].x, route.nodes[node].z, 0);
        let yaw = route.nodes[node].yaw || 0, time = 0;
        this.initial = { node, dir, phase: 'dwell', activity: 'watch', clip: 'Idle_Loop',
            x: route.nodes[node].x, z: route.nodes[node].z, level, yaw, fromYaw: yaw, duration: 5, start: 0, sips: 0 };
        const append = segment => {
            segment.start = time;
            segment.fromYaw = yaw;
            time += segment.duration;
            yaw = segment.yaw;
            this.segments.push(segment);
        };
        for (let leg = 0; leg < (route.nodes.length - 1) * 2; leg++) {
            const from = route.nodes[node];
            let next = node + dir;
            if (next >= route.nodes.length) { next = route.nodes.length - 2; dir = -1; }
            else if (next < 0) { next = 1; dir = 1; }
            const to = route.nodes[next], distance = Math.hypot(to.x - from.x, to.z - from.z);
            const fromLevel = level;
            // Sample the authoritative surfaces in small steps once, so late joins have a height hint on the stair.
            const steps = Math.max(1, Math.ceil(distance / 0.15));
            for (let i = 1; i <= steps; i++) {
                const p = i / steps;
                level = surface(from.x + (to.x - from.x) * p, from.z + (to.z - from.z) * p, level);
            }
            append({ node: next, dir, phase: 'walk', activity: 'walk', clip: 'Walk', duration: distance / route.speed,
                x: from.x, z: from.z, toX: to.x, toZ: to.z, level: fromLevel, toLevel: level,
                yaw: Math.atan2(to.x - from.x, to.z - from.z), sips: 0 });
            node = next;
            const partner = partnerPosition(to);
            const facing = partner ? Math.atan2(partner.x - to.x, partner.z - to.z) : yaw;
            const hold = (activity, seconds, sips = 0) => {
                const clip = ['pickup', 'drink', 'return'].includes(activity) ? 'Drink_Loop'
                    : activity === 'talk' || to.drink ? 'Idle_Talking_Loop' : to.clip || 'Idle_Loop';
                append({ node, dir, phase: 'dwell', activity, clip, duration: seconds, x: to.x, z: to.z, level,
                    yaw: activity === 'balcony' || activity === 'watch' || activity === 'smoke' ? to.yaw : facing,
                    sips });
            };
            if (to.drink) {
                for (const [activity, seconds, sips] of MinglerClock.DRINK_STAGES) hold(activity, seconds, sips);
            } else if (to.activity) {
                hold(to.activity, duration(to.dwell || route.dwell));
                if (to.talk) hold('talk', duration(to.talk));
            } else if (to.guest != null || to.bartender) {
                hold('talk', duration(to.dwell || route.dwell));
            }
        }
        this.period = time;
    }

    sample(seconds) {
        let segment = this.initial, elapsed = Math.max(0, seconds), index = -1;
        if (elapsed >= 5) {
            const time = (elapsed - 5) % this.period;
            for (let i = 0; i < this.segments.length; i++) {
                const candidate = this.segments[i];
                if (time < candidate.start + candidate.duration) {
                    segment = candidate;
                    elapsed = time - candidate.start;
                    index = i;
                    break;
                }
            }
        }
        const out = this.result, p = elapsed / segment.duration;
        out.index = index;
        out.node = segment.node;
        out.dir = segment.dir;
        out.phase = segment.phase;
        out.activity = segment.activity;
        out.clip = segment.clip;
        out.duration = segment.duration;
        out.elapsed = elapsed;
        out.timer = Math.max(0, segment.duration - elapsed);
        out.sips = segment.sips;
        out.x = segment.x;
        out.z = segment.z;
        out.level = segment.level;
        if (segment.phase === 'walk') {
            out.x += (segment.toX - segment.x) * p;
            out.z += (segment.toZ - segment.z) * p;
            out.level += (segment.toLevel - segment.level) * p;
        }
        let yaw = segment.yaw;
        if (segment.activity === 'watch' || segment.activity === 'smoke') {
            yaw += (segment.activity === 'smoke' ? 0.22 : 0.13) *
                (0.72 * Math.sin(elapsed * 0.29) + 0.28 * Math.sin(elapsed * 0.11 + 1.4));
        }
        out.yaw = segment.fromYaw + Math.atan2(Math.sin(yaw - segment.fromYaw), Math.cos(yaw - segment.fromYaw)) *
            (1 - Math.exp(-4 * elapsed));
        return out;
    }
}

window.MinglerClock = MinglerClock;
