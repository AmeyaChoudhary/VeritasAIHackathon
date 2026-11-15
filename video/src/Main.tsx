import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import media from "./media.json";
import { loadFonts } from "./theme";
import { sceneRange, totalFrames } from "./timing";
import { Stage } from "./components/Stage";
import { Captions } from "./components/Captions";
import { Hook } from "./scenes/Hook";
import { Demo } from "./scenes/Demo";
import { Evidence } from "./scenes/Evidence";
import { Outro } from "./scenes/Outro";

loadFonts();

export const Main: React.FC = () => {
  const hook = sceneRange("hook", 0);
  const demoFrom = sceneRange("steady").from;
  const how = sceneRange("how");
  const close = sceneRange("close");
  return (
    <AbsoluteFill>
      <Stage />
      <Sequence from={hook.from} durationInFrames={hook.dur + 8} name="hook"><Hook /></Sequence>
      <Sequence from={demoFrom} durationInFrames={how.from - demoFrom + 10} name="demo"><Demo /></Sequence>
      <Sequence from={how.from} durationInFrames={close.from - how.from + 10} name="evidence"><Evidence /></Sequence>
      <Sequence from={close.from} durationInFrames={totalFrames() - close.from} name="outro"><Outro /></Sequence>
      <Captions />
      <Audio src={staticFile(media.voiceSrc)} />
      {media.musicVolume > 0 ? <Audio src={staticFile(media.music)} volume={media.musicVolume} /> : null}
    </AbsoluteFill>
  );
};
