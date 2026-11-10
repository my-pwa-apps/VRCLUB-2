// Fictional guests and measured venue corridors, never visitor/account identities.
export const ATTENDEE_NAMES = Object.freeze([
    'Amina', 'Hiroto', 'Sofia', 'Mateo', 'Priya', 'Kwame', 'Lina', 'Emre',
    'Mei', 'Amara', 'Diego', 'Noor', 'Anika', 'Tomas', 'Fatima', 'Jun',
    'Leila', 'Andrei', 'Thandi', 'Omar', 'Yuki', 'Nia', 'Arjun', 'Ines',
    'Rafael', 'Zeynep', 'Minh', 'Zara', 'Luca', 'Sana', 'Santiago'
]);
export const DANCE_SPOTS = [-1, 1].flatMap(side =>
    [-7.2, -9.2, -11.2].map(z => ({ x: side * 3.3, z })));

const nodes = new Map(), destinations = [], edges = [];
const node = (id, x, z, level = 0) => {
    const value = { id, x, z, floorY: level };
    nodes.set(id, value);
    return id;
};
const link = (a, b) => { edges.push([nodes.get(a), nodes.get(b)]); };
const chain = (...ids) => { for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]); };
const destination = (id, anchor, x, z, activity, options = {}) => {
    node(id, x, z, options.floorY || 0);
    link(anchor, id);
    destinations.push({ ...nodes.get(id), activity, yaw: Math.atan2(-x, -18 - z), ...options });
};
node('hall', 0.55, -5.5);
node('left', -4.1, -5.5);
node('right', 4.1, -5.5);
chain('left', 'hall', 'right');
for (const side of [-1, 1]) {
    let last = side < 0 ? 'left' : 'right';
    for (const z of [-7.2, -9.2, -11.2, -12.3]) {
        const id = node(`floor-${side}-${z}`, side * 4.1, z);
        link(last, id);
        last = id;
    }
}
link('floor--1--12.3', 'floor-1--12.3');
DANCE_SPOTS.forEach((spot, i) =>
    destination(`dance-${i}`, `floor-${Math.sign(spot.x)}-${spot.z}`, spot.x, spot.z, 'dance'));

node('front-left', -9.4, -3.2);
node('front-mid', -4.1, -3.2);
node('front-right', 4.1, -3.2);
node('lounge-front', 7.1, -2.4);
chain('left', 'front-mid', 'front-left');
chain('right', 'front-right', 'lounge-front');
for (const [group, x, anchor] of [['inside-left', -8, 'front-left'], ['inside-mid', -4, 'front-mid'],
    ['inside-right', 4.8, 'front-right']]) {
    for (const [i, dx, dz] of [[0, -0.65, 0], [1, 0.65, 0], [2, 0, -1.1]]) {
        destination(`${group}-${i}`, anchor, x + dx, -1.7 + dz, 'talk', { group });
    }
}
node('wall-left-approach', -6, -3.8);
node('wall-mid-approach', -2, -3.8);
link('front-left', 'wall-left-approach');
link('hall', 'wall-mid-approach');
for (const [i, x] of [-11.3, -10, -5.5, -2.8, 2.8, 9.3, 10.8, 11.6].entries()) {
    const anchor = ['front-left', 'front-left', 'wall-left-approach', 'wall-mid-approach', 'front-right',
        'lounge-front', 'lounge-front', 'lounge-front'][i];
    destination(`wall-${i}`, anchor, x, -0.95, 'watch');
}
for (let i = 0; i < 2; i++) destination(`lounge-${i}`, 'lounge-front', 7.1 + (i ? 0.42 : -0.42), -0.89,
    'seat', { seatH: 0.4, yaw: Math.PI, group: 'lounge' });

node('bar-front', 8.35, -5.5);
link('right', 'bar-front');
let lastBar = 'bar-front';
for (const [i, z] of [...[-12.9, -11.6, -10.3, -9, -7.7].entries()].reverse()) {
    const anchor = node(`bar-aisle-${i}`, 8.35, z);
    link(lastBar, anchor);
    lastBar = anchor;
    if (i !== 1) destination(`bar-${i}`, anchor, 9.2, z, 'seat', { seatH: 0.76, yaw: Math.PI / 2, group: 'bar' });
}

node('stair-bottom', -11.05, -6.2);
node('stair-top', -11.05, -10.4, 3);
node('balcony-mid', -11.05, -12.5, 3);
node('balcony-turn', -11.05, -14.8, 3);
node('balcony-aisle', -10.5, -14.8, 3);
node('balcony-end', -10.5, -18.3, 3);
chain('front-left', 'stair-bottom', 'stair-top', 'balcony-mid', 'balcony-turn', 'balcony-aisle', 'balcony-end');
for (const [i, z] of [-11.7, -12.7, -18.35].entries()) {
    destination(`balcony-watch-${i}`, i === 2 ? 'balcony-end' : 'balcony-mid', -10.25, z, 'watch',
        { floorY: 3, yaw: Math.PI / 2, group: i === 2 ? 'balcony-end' : 'balcony-view' });
}
for (const [i, z] of [-17.55, -15.65].entries()) {
    const anchor = node(`balcony-seat-front-${i}`, -10.5, z, 3);
    link('balcony-aisle', anchor);
    destination(`balcony-${i}`, anchor, -11.3, z, 'seat',
        { floorY: 3, seatH: 0.76, yaw: i ? Math.PI : 0, group: 'balcony-table' });
}

node('restroom-entry', -12, -3.2);
node('restroom-hall', -13.45, -3.2);
chain('front-left', 'restroom-entry', 'restroom-hall');
for (const [i, z] of [-5.4, -2].entries()) {
    const approach = node(`toilet-front-${i}`, -13.45, z);
    link('restroom-hall', approach);
    destination(`toilet-${i}`, approach, -15.62, z, 'toilet', { seatH: 0.42, yaw: Math.PI / 2 });
}

node('entrance-bottom', 0, 0.85);
node('entrance-top', 0, 5, 2.8);
node('outside-door', 0, 6.8, 2.8);
chain('hall', 'entrance-bottom', 'entrance-top', 'outside-door');
let outside = 'outside-door';
for (const [i, x] of [-4, -8, -12].entries()) {
    const anchor = node(`outside-${i}`, x, 8.7, 2.8);
    link(outside, anchor);
    outside = anchor;
    for (const [j, dx, dz] of [[0, -0.65, 0], [1, 0.65, 0], [2, 0, -1.1]]) {
        destination(`outside-talk-${i}-${j}`, anchor, x + dx, 7.2 + dz, 'talk',
            { floorY: 2.8, group: `outside-${i}`, yaw: 0 });
    }
    destination(`fresh-air-${i}`, anchor, x - 1, 8.55, 'air', { floorY: 2.8, yaw: 0 });
}
export const DEV_DESTINATIONS = Object.freeze(destinations.map(value => Object.freeze(value)));
export const DEV_NAV_EDGES = Object.freeze(edges);
const byId = new Map(DEV_DESTINATIONS.map(value => [value.id, value]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.floorY - b.floorY, a.z - b.z);

function pathBetween(start, end) {
    const costs = new Map([[start, 0]]), previous = new Map(), pending = new Set([start]);
    while (pending.size) {
        let id = null;
        for (const candidate of pending) if (id === null || costs.get(candidate) < costs.get(id)) id = candidate;
        pending.delete(id);
        if (id === end) {
            const path = [nodes.get(end)];
            while (previous.has(path[0].id)) path.unshift(nodes.get(previous.get(path[0].id)));
            return path;
        }
        for (const [a, b] of edges) {
            const next = a.id === id ? b : b.id === id ? a : null;
            if (!next) continue;
            const cost = costs.get(id) + distance(nodes.get(id), next);
            if (cost >= (costs.get(next.id) ?? Infinity)) continue;
            costs.set(next.id, cost);
            previous.set(next.id, id);
            pending.add(next.id);
        }
    }
    throw new Error(`No DEV navigation path from ${start} to ${end}.`);
}
const paths = new Map();
function route(start, end) {
    const key = `${start}:${end}`;
    if (!paths.has(key)) paths.set(key, pathBetween(start, end));
    return paths.get(key);
}
function pointDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.floorY - a.floorY, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.floorY - a.floorY) * dy +
        (p.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1)));
    return Math.hypot(p.x - a.x - t * dx, p.floorY - a.floorY - t * dy, p.z - a.z - t * dz);
}
function pathNear(path, p, gap) {
    return path.some((b, i) => i && pointDistance(p, path[i - 1], b) < gap);
}
function pathsCross(a, b) {
    // Sample the swept corridor, not just waypoints: crossing corridors cannot start together.
    for (let i = 1; i < a.length; i++) {
        const from = a[i - 1], to = a[i], steps = Math.ceil(distance(from, to) / 0.25);
        for (let j = 0; j <= steps; j++) {
            const t = j / steps;
            if (pathNear(b, { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t,
                floorY: from.floorY + (to.floorY - from.floorY) * t }, 0.85)) return true;
        }
    }
    return false;
}
const CONVERSATIONS = Object.freeze({
    inside: [['This set has such a lovely groove.', 'Yes! Shall we dance after this?', 'Definitely, give me a minute.'],
        ['Have you been here before?', 'First time. I love the atmosphere.', 'Same here. The lights are brilliant.']],
    outside: [['It is nice to get a little fresh air.', 'Absolutely. That last track was great.', 'Let us go back in after a minute.']],
    balcony: [['You can see the whole dance floor from here.', 'And the lights look amazing.', 'I could stay here for a while.']],
    lounge: [['My feet needed a little break.', 'Same. We have been dancing for ages.', 'One more track and we are back.']],
    bar: [['What a good night so far.', 'That DJ really knows how to build a set.', 'I wonder what the next track will be.']]
});

export class DevAttendees {
    constructor(seed = 0, now = Date.now()) {
        this.seed = seed >>> 0;
        this.now = now;
        this.clock = now;
        this.accumulator = 0;
        this.guests = new Map();
        this.resources = new Map();
        this.seatHolds = new Map();
        this.chatAt = now + 4000;
        this.chatTurn = 0;
        this.chatGroup = null;
        this.conversations = new Map();
    }

    _random(bot) {
        bot.random = (Math.imul(bot.random, 1664525) + 1013904223) >>> 0;
        return bot.random / 4294967296;
    }

    _state(bot, moving = false) {
        const target = bot.destination;
        const seated = !moving && (target.activity === 'seat' || target.activity === 'toilet');
        return { x: bot.position.x, y: bot.position.floorY + (seated ? 1.2 : 1.7), z: bot.position.z,
            floorY: bot.position.floorY, rotY: bot.yaw, eh: 1.7, seated,
            ...(seated ? { seatH: target.seatH, seat: target.id } : {}),
            dancing: !moving && target.activity === 'dance', talking: false };
    }

    _occupied(destination, people) {
        return (this.seatHolds.get(destination.id) || 0) > this.clock ||
            people.some(person => Math.abs(person.floorY - destination.floorY) < 0.5 &&
                Math.hypot(person.x - destination.x, person.z - destination.z) < (person.seated ? 1.05 : 0.8));
    }

    add(index, people = []) {
        const available = DEV_DESTINATIONS.filter(place => !this.resources.has(place.id) && !this._occupied(place, people) &&
            people.every(person => distance(place, person) >= 1.25) &&
            ![...this.guests.values()].some(other => distance(place, other.position) < 0.8));
        if (!available.length) throw new Error('No clear starting activity for a simulated attendee.');
        const destination = available[index < 6 ? 0 : (index * 17 + this.seed % 47) % available.length];
        const bot = { index, name: ATTENDEE_NAMES[index], random: (this.seed + index * 7919 + 1) >>> 0,
            destination, position: { ...destination }, at: destination.id, yaw: destination.yaw,
            path: null, visits: new Set([destination.activity]), completed: 0, travelled: 0,
            gestureAt: this.clock + 5000 + index * 1700, chooseAt: this.clock + 15000 + index * 1300 };
        bot.departAt = this.clock + 45000 + this._random(bot) * 120000;
        bot.state = this._state(bot);
        this.guests.set(index, bot);
        this.resources.set(destination.id, index);
        return bot;
    }

    remove(index) {
        this.guests.delete(index);
        for (const [id, owner] of this.resources) if (owner === index) this.resources.delete(id);
    }

    yieldSeat(id) {
        const seat = byId.get(id);
        if (!seat || (seat.activity !== 'seat' && seat.activity !== 'toilet')) return false;
        this.seatHolds.set(id, this.clock + 30000);
        const bot = this.guests.get(this.resources.get(id));
        if (bot) {
            bot.yielding = true;
            bot.departAt = 0;
            bot.chooseAt = this.clock;
            if (!bot.path) {
                bot.state = this._state(bot, true);
                bot.releaseAt = this.clock + (seat.activity === 'toilet' ? 900 : 250);
            } else if (bot.destination.id === id) this._retreat(bot);
        }
        return true;
    }

    _canStart(bot, path, people, moving) {
        if (moving.length >= (bot.yielding ? 5 : 3)) return false;
        if (moving.some(other => other.path && pathsCross(path, other.path))) return false;
        if (people.some(person => pathNear(path, person, 0.65) && distance(person, bot.position) > 0.8)) return false;
        return ![...this.guests.values()].some(other => other !== bot && !other.path && pathNear(path, other.position, 0.62));
    }

    _choose(bot, people, moving, doors) {
        const choices = DEV_DESTINATIONS.filter(place => place.id !== bot.destination.id && !this.resources.has(place.id) &&
            !this._occupied(place, people) && !(place.activity === 'toilet' && doors[Number(place.id.at(-1))]));
        const ranked = choices.map(place => {
            const path = route(bot.at, place.id);
            const novelty = bot.visits.has(place.activity) ? 1 : 3;
            const company = place.group && [...this.guests.values()].some(other =>
                other !== bot && !other.path && other.destination.group === place.group) ? 2 : 1;
            return { place, path, score: this._random(bot) * novelty * company / (1 + path.length * 0.025) };
        }).sort((a, b) => b.score - a.score);
        for (const { place, path } of ranked) {
            if (!this._canStart(bot, path, people, moving)) continue;
            bot.origin = bot.destination;
            bot.releaseAt = bot.origin.activity === 'toilet' ? this.clock + 900 : 0;
            bot.destination = place;
            bot.path = path;
            bot.waypoint = 1;
            bot.blockedAt = null;
            bot.yaw = Math.atan2(path[1].x - bot.position.x, path[1].z - bot.position.z);
            this.resources.set(place.id, bot.index);
            bot.state = this._state(bot, true);
            bot.gesture = bot.emoji = bot.chat = null;
            moving.push(bot);
            return true;
        }
        bot.chooseAt = this.clock + 2500 + this._random(bot) * 3500;
        return false;
    }

    _retreat(bot) {
        this.resources.delete(bot.destination.id);
        bot.path = [{ ...bot.position }, ...bot.path.slice(0, bot.waypoint).reverse()];
        bot.waypoint = 1;
        bot.destination = bot.origin;
        bot.returning = true;
        this.resources.set(bot.origin.id, bot.index);
    }

    _walk(bot, dt, people) {
        if (!bot.returning && this._occupied(bot.destination, people)) this._retreat(bot);
        if (this.clock < bot.releaseAt) return;
        let remaining = dt * (0.85 + bot.index % 7 * 0.045);
        while (remaining > 1e-8 && bot.path) {
            const target = bot.path[bot.waypoint], gap = distance(bot.position, target);
            const step = Math.min(gap, remaining), t = gap ? step / gap : 1;
            const next = { x: bot.position.x + (target.x - bot.position.x) * t,
                z: bot.position.z + (target.z - bot.position.z) * t,
                floorY: bot.position.floorY + (target.floorY - bot.position.floorY) * t };
            if (people.some(person => distance(next, person) < 0.65 &&
                distance(next, person) < distance(bot.position, person) - 1e-7)) {
                bot.blockedAt ??= this.clock;
                // Backtrack along the already reserved route rather than queue behind a visitor.
                if (this.clock - bot.blockedAt > 2500 && !bot.returning) {
                    this._retreat(bot);
                }
                return;
            }
            bot.blockedAt = null;
            bot.yaw = Math.atan2(target.x - bot.position.x, target.z - bot.position.z);
            bot.position = next;
            bot.travelled += step;
            remaining -= step;
            bot.state = this._state(bot, true);
            if (bot.origin && distance(bot.position, bot.origin) > 0.85 &&
                this.resources.get(bot.origin.id) === bot.index && !bot.returning) this.resources.delete(bot.origin.id);
            if (gap > step + 1e-8) break;
            bot.at = target.id;
            if (++bot.waypoint < bot.path.length) continue;
            bot.path = null;
            bot.returning = false;
            bot.yielding = false;
            bot.origin = null;
            bot.yaw = bot.destination.yaw;
            bot.visits.add(bot.destination.activity);
            bot.completed++;
            bot.departAt = this.clock + (bot.destination.activity === 'toilet' ? 25000 : 60000) + this._random(bot) * 120000;
            bot.chooseAt = bot.departAt;
            this.resources.set(bot.destination.id, bot.index);
            bot.state = this._state(bot);
        }
    }

    _socialize() {
        const resting = [...this.guests.values()].filter(bot => !bot.path && !bot.yielding);
        for (const bot of resting) {
            bot.state = this._state(bot);
            const partners = resting.filter(other => other !== bot && bot.destination.group &&
                other.destination.group === bot.destination.group && distance(bot.position, other.position) < 3);
            bot.partnerIndex = partners[0]?.index ?? null;
            if (partners.length && bot.destination.activity !== 'toilet') {
                const x = partners.reduce((sum, other) => sum + other.position.x, 0) / partners.length;
                const z = partners.reduce((sum, other) => sum + other.position.z, 0) / partners.length;
                if (!bot.state.seated) bot.state = { ...bot.state, rotY: Math.atan2(x - bot.position.x, z - bot.position.z),
                    talking: true };
            }
            if (this.clock >= bot.gestureAt && (partners.length || bot.state.dancing)) {
                bot.gestureAt = this.clock + 25000 + this._random(bot) * 22000;
                if (!bot.state.seated) bot.gesture = bot.state.dancing || bot.index % 2 === 0 ? 'nod' : 'wave';
                bot.emoji = bot.state.dancing ? '\u{1F64C}' : bot.index % 2 ? '\u{1F44B}' : null;
            }
        }
        if (this.clock < this.chatAt) return;
        this.chatAt = this.clock + 5000;
        const groups = [...new Set(resting.filter(bot => bot.partnerIndex !== null).map(bot => bot.destination.group))];
        if (!groups.length) return;
        const group = groups.includes(this.chatGroup) ? this.chatGroup : groups[this.chatTurn++ % groups.length];
        this.chatGroup = group;
        const members = resting.filter(bot => bot.destination.group === group && bot.partnerIndex !== null);
        const theme = group.startsWith('outside') ? 'outside' : group.startsWith('balcony') ? 'balcony' :
            group === 'lounge' ? 'lounge' : group === 'bar' ? 'bar' : 'inside';
        const turn = this.conversations.get(group) || 0;
        this.conversations.set(group, turn + 1);
        if (turn % 3 === 2) this.chatGroup = null;
        const scripts = CONVERSATIONS[theme], script = scripts[Math.floor(turn / 3) % scripts.length];
        members[turn % members.length].chat = script[turn % script.length];
    }

    step(now, people = [], doors = []) {
        for (const bot of this.guests.values()) { bot.gesture = null; bot.emoji = null; bot.chat = null; }
        this.accumulator += Math.max(0, Math.min(250, now - this.now));
        this.now = now;
        while (this.accumulator >= 50) {
            this.accumulator -= 50;
            this.clock += 50;
            const moving = [...this.guests.values()].filter(bot => bot.path);
            for (const bot of this.guests.values()) {
                if (bot.path) { this._walk(bot, 0.05, people); continue; }
                if (!bot.yielding && bot.state.seated && this._occupied(bot.destination, people)) this.yieldSeat(bot.destination.id);
                if (this.clock < (bot.releaseAt || 0) || this.clock < bot.chooseAt) continue;
                if (this.clock >= bot.departAt || bot.yielding) this._choose(bot, people, moving, doors);
            }
            this._socialize();
        }
    }
}
