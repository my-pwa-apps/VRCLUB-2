/**
 * VR Club - TypeScript Ambient Definitions & Public API Interface
 */

export interface Vector3Like {
    x: number;
    y: number;
    z: number;
}

export interface Color3Like {
    r: number;
    g: number;
    b: number;
}

export type GraphicsTier = 'ultra' | 'high' | 'balanced';

export interface QualityTierSettings {
    renderScale: number;
    pipelineSamples: number;
    bloomKernel: number;
    ssr: boolean;
    ssrQuality: 'high' | 'balanced';
    motionBlur: boolean;
    motionBlurSamples: number;
    contactHardeningShadows: boolean;
    shadowQuality: 'high' | 'medium' | 'low';
    anisotropy: number;
    probeResolution: number;
    ssaoSamples: number;
    ssaoExpensiveBlur: boolean;
    floorShadows: boolean;
    crowdSize: number;
    mirrorSpots: number;
}

export interface DiagnosticLogEntry {
    timestamp: number;
    time: number;
    category: string;
    message: string;
    data?: any;
}

export interface DiagnosticsReport {
    timestamp: string;
    tier: GraphicsTier;
    isInVR: boolean;
    fps: number;
    drawCalls: number;
    meshes: number;
    activeMeshes: number;
    materials: number;
    audioState: string;
    safeMode: boolean;
    bassHaptics: boolean;
    recentLogs: DiagnosticLogEntry[];
}

export interface AudioFrameData {
    bass: number;
    mid: number;
    treble: number;
    average: number;
    hasAudio: boolean;
}

export interface ShowCue {
    look: string;
    bars: number;
    palette?: string;
    intensity?: number | [number, number];
    punch?: number;
}

export interface Movement {
    name: string;
    minBars: number;
    cues: ShowCue[];
}

export interface DJBoothPositions {
    djBooth: Vector3Like;
    danceFloor: Vector3Like;
    entrance: Vector3Like;
    mirrorBall: Vector3Like;
    paSpeakers: {
        left: Vector3Like;
        right: Vector3Like;
    };
}

export declare const ROOM_BOUNDS: {
    x: { min: number; max: number; width: number };
    y: { min: number; max: number; height: number };
    z: { min: number; max: number; depth: number };
};

export declare const CLUB_POSITIONS: DJBoothPositions;

export declare class AudioUtils {
    static isSafeAudioUrl(url: string | null, pageHref?: string): boolean;
}

export declare class IndexedDBAssetCache {
    constructor(opts: { dbName: string; storeName: string; version?: number; maxAgeMs?: number; logger?: any });
    init(): Promise<void>;
    get(url: string): Promise<ArrayBuffer | null>;
    put(url: string, data: ArrayBuffer | Uint8Array): Promise<boolean>;
}

export declare class InFlightRegistry {
    run<T>(key: string, factory: () => Promise<T>): Promise<T>;
}

export declare class TextureLoader {
    constructor(scene: any, logger?: any);
    init(): Promise<void>;
    loadAllTextures(): Promise<any>;
    releaseTexture(texture: any): void;
    clearTexturePool(): void;
}

export declare class ModelLoader {
    constructor(scene: any, materialFactory?: any, logger?: any, maxLights?: number | null,
        options?: { lightFactory?: LightFactory | null; textureLoader?: TextureLoader | null });
    init(): Promise<void>;
    loadAllModels(): Promise<void>;
    dispose(): void;
}

export declare class MaterialFactory {
    constructor(scene: any, maxLights: number, logger?: any);
    getPreset(name: string): any;
    /** Pass `mutable: true` in options when colours are written at runtime (otherwise frozen). */
    createPBRMaterial(name: string, options: any, shared?: boolean): any;
    createStandardMaterial(name: string, options: any): any;
    createFullPBRMaterial(name: string, options: any, shared?: boolean): any;
}

export declare class LightFactory {
    constructor(scene: any, logger?: any, maxLights?: number | null);
    createPointLight(name: string, position: Vector3Like, config?: any): any;
    createSpotLight(name: string, position: Vector3Like, direction: Vector3Like, config?: any): any;
    getPreset(presetName: string, ...args: any[]): any;
    getGroup(groupName: string): any[];
    disposeLight(name: string): void;
    disposeGroup(groupName: string): void;
    dispose(): void;
}

export declare class VJDirector {
    constructor(club: any);
    bpm: number;
    beatEnvelope: number;
    barPhase: number;
    beatNumber: number;
    paletteMode: string;
    update(timeSec: number, audioData: AudioFrameData | null): void;
    tapTempo(): void;
    triggerDrop(): void;
    blackout(durationMs?: number): void;
    setBPM(bpm: number): void;
}

export declare class ShowDirector {
    constructor(club: any);
    enabled: boolean;
    isDriving(): boolean;
    update(timeSec: number, audioData: AudioFrameData | null): void;
}

/** Remote-guest state on the wire. `y` is the sender's EYE height. */
export interface TrackedHandPose {
    x: number; y: number; z: number;
    fx: number; fy: number; fz: number;
    ux: number; uy: number; uz: number;
}
export interface PeerState {
    x: number; y: number; z: number; rotY: number;
    hands?: { left: TrackedHandPose | null; right: TrackedHandPose | null } | null;
}

export interface SharedMusicState { url: string | null; playing: boolean; position: number; updatedAt?: number; }

export declare class NetworkClient {
    static CLOSE_ROOM_FULL: number;
    static CLOSE_FLOODING: number;
    static isShareableMusicUrl(url: string): boolean;
    constructor(options?: { serverUrl?: string; room?: string; name?: string });
    readonly connected: boolean;
    readonly peerCount: number;
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
    micEnabled: boolean;
    targetedChat: boolean;
    voiceAudience: Set<string> | null;
    isHost(): boolean;
    connect(): void;
    disconnect(): void;
    dispose(): void;
    sendState(state: PeerState): void;
    sendEmoji(emoji: string): void;
    sendChat(text: string, targets?: string[] | null): boolean;
    setVoiceAudience(ids: string[] | null): void;
    /** Returns false (and sends nothing) unless host and the URL is http(s). */
    sendMusic(music: SharedMusicState): boolean;
    enableVoice(): Promise<void>;
    disableVoice(): void;
    onStatusChange: (status: string) => void;
    onPeerJoin: (id: string, name: string) => void;
    onPeerState: (id: string, state: PeerState) => void;
    onPeerLeave: (id: string) => void;
    onEmoji: (id: string, emoji: string) => void;
    onChat: (id: string, text: string, restricted: boolean) => void;
    onMusic: (music: SharedMusicState) => void;
    onHostChange: (hostId: string | null) => void;
    onRemoteStream: (id: string, stream: MediaStream) => void;
    onError: (error: Error) => void;
}

export declare class AvatarManager {
    static EYE_HEIGHT: number;
    static shortestAngle(from: number, to: number): number;
    constructor(club: VRClub);
    ensurePeer(id: string, name?: string | null): any;
    updatePeerState(id: string, name: string | null, state: PeerState): void;
    showEmoji(id: string, emoji: string): void;
    attachVoice(id: string, stream: MediaStream): void;
    detachVoice(id: string): void;
    removePeer(id: string): void;
    update(dtSeconds: number): void;
    dispose(): void;
}

export declare class VRClub {
    constructor();
    ready: boolean;
    initPromise: Promise<void>;
    graphicsTier: GraphicsTier;
    qualityTiers: Record<GraphicsTier, QualityTierSettings>;
    tierSettings: QualityTierSettings;
    photosensitiveSafeMode: boolean;
    bassHapticsEnabled: boolean;
    isInVRMode: boolean;
    debugMode: boolean;

    // Lighting and effect states
    lightsActive: boolean;
    lasersActive: boolean;
    ledWallActive: boolean;
    ledMonochrome: boolean;
    strobesActive: boolean;
    mirrorBallActive: boolean;
    laserSheetActive: boolean;
    laserSheetOrigin: 'both' | 'ceilingLeft' | 'ceilingRight';
    laserSheetMotion: 'vertical' | 'lateral';
    smokeActive: boolean;

    // Speeds
    spotlightSpeed: number;
    laserSpeed: number;
    mirrorBallSpeed: number;
    ledWallSpeed: number;
    strobeSpeed: number;

    // Directors
    vjDirector: VJDirector | null;
    showDirector: ShowDirector | null;

    // Methods
    setGraphicsTier(tier: GraphicsTier): void;
    setPhotosensitiveSafeMode(enabled: boolean): boolean;
    setBassHapticsEnabled(enabled: boolean): boolean;
    getAudioData(): AudioFrameData;
    startAudioStream(url: string): Promise<void>;
    startAudioFromFile(file: File): Promise<void>;
    toggleAudioPlayback(): boolean;
    toggleLightControl(control: string): boolean;
    takeLightControl(): void;
    resumeAutoShow(): void;
    setLightSpeed(value: number): number;
    pulseHaptic(intensity?: number, duration?: number): void;
    updateSpatialAudioListener(): void;
    recordDiagnostic(category: string, message: string, data?: any): void;
    getDiagnostics(): DiagnosticsReport;
    moveCameraToPreset(preset: string): void;
    jumpDesktop(): boolean;
    dispose(): void;
}

declare global {
    interface Window {
        VRClub: typeof VRClub;
        vrClub: VRClub | null;
        VJDirector: typeof VJDirector;
        ShowDirector: typeof ShowDirector;
        ROOM_BOUNDS: typeof ROOM_BOUNDS;
        CLUB_POSITIONS: typeof CLUB_POSITIONS;
    }
}
