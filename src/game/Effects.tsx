import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

/**
 * Post-processing. Only colours brighter than the threshold bloom, so the reactor, screens, neon, engine
 * flames, beams and the sun (all HDR emissive materials) glow while ordinary surfaces stay crisp.
 * Tone mapping is done here, after the bloom, because the renderer's own is switched off (see <Canvas flat>).
 */
export function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={1.1} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur radius={0.75} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.25} darkness={0.55} />
    </EffectComposer>
  )
}
