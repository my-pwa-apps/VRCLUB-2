const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => {
    const length = Math.hypot(...v);
    if (length < 1e-8) throw new Error('Cannot author an arm frame from a degenerate axis.');
    return v.map(value => value / length);
};
const frame = (axis, normal) => {
    const x = unit(axis);
    const z = unit(normal.map((value, i) => value - x[i] * dot(normal, x)));
    return [x, cross(z, x), z];
};

// Aim AND elbow hinge: independent shortest swings aim the bones but roll the elbow sideways.
export function armFrameRotation(restAxis, restNormal, axis, normal) {
    const from = frame(restAxis, restNormal), to = frame(axis, normal);
    const m = Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, col) =>
        to.reduce((sum, basis, i) => sum + basis[row] * from[i][col], 0)));
    const trace = m[0][0] + m[1][1] + m[2][2];
    let q;
    if (trace > 0) {
        const s = 2 * Math.sqrt(trace + 1);
        q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
    } else {
        const i = m[0][0] > m[1][1] && m[0][0] > m[2][2] ? 0 : m[1][1] > m[2][2] ? 1 : 2;
        const j = (i + 1) % 3, k = (i + 2) % 3;
        const s = 2 * Math.sqrt(1 + m[i][i] - m[j][j] - m[k][k]);
        q = [0, 0, 0, (m[k][j] - m[j][k]) / s];
        q[i] = s / 4; q[j] = (m[j][i] + m[i][j]) / s; q[k] = (m[k][i] + m[i][k]) / s;
    }
    return unit(q);
}

export function armPronation(relative, restAxis) {
    const axis = unit(restAxis);
    const angle = 2 * Math.atan2(dot(relative.slice(0, 3), axis), relative[3]);
    const roll = Math.atan2(Math.sin(angle), Math.cos(angle));
    // Turn the forearm with the palm rather than putting the entire palm roll into the wrist.
    return Math.max(-Math.PI * 5 / 12, Math.min(Math.PI * 5 / 12, roll * 0.7));
}
