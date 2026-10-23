import { Option } from "@lambe/kernel/option";
import type {
  CaptionSurface,
  CaptionSurfaceListener,
} from "../../application/ports/caption-surface";
import type { CaptionBrief } from "../../domain/caption/caption-brief";
import { VideoId } from "../../domain/caption/value-objects/video-id.vo";
import { parseTimedtext, type TimedtextCapture } from "./json3-track";
import { listenTimedtext } from "./timedtext-channel";
import { YOUTUBE_SELECTORS } from "./youtube-selectors";

interface YoutubePlayerSurfaceDeps {
  doc: Document;
  window: Window;
}

const WATCH_PATH = "/watch";

const PRESSED = "aria-pressed";

const HIDE_NATIVE_CSS = `.${YOUTUBE_SELECTORS.nativeHiddenClass} ${YOUTUBE_SELECTORS.captionContainer} { display: none !important; }`;

const cleanText = (text: string | null | undefined): string =>
  (text ?? "").replace(/\s+/g, " ").trim();

export class YoutubePlayerSurface implements CaptionSurface {
  private turnedCaptionsOn = false;

  private restoring = false;

  constructor(private readonly deps: YoutubePlayerSurfaceDeps) {}

  videoId(): Option<VideoId> {
    const { pathname, searchParams } = new URL(this.deps.window.location.href);

    if (pathname !== WATCH_PATH) return Option.none();

    const id = VideoId.create(searchParams.get("v") ?? "");

    return id.isSuccess ? Option.some(id.getValue()) : Option.none();
  }

  playheadMs(): Option<number> {
    const player = this.player();

    if (player === null || player.classList.contains(YOUTUBE_SELECTORS.adShowingClass))
      return Option.none();

    const video = player.querySelector(YOUTUBE_SELECTORS.video);

    if (!(video instanceof HTMLMediaElement)) return Option.none();

    return Option.some(Math.round(video.currentTime * 1000));
  }

  readBrief(): Omit<CaptionBrief, "generated" | "preceding"> {
    const { window } = this.deps;
    const metadata = this.currentMetadata();
    const read = (selector: string): string =>
      cleanText(metadata?.querySelector(selector)?.textContent);

    return {
      kind: "captions",
      host: window.location.host,
      url: window.location.href,
      title: read(YOUTUBE_SELECTORS.title),
      channel: read(YOUTUBE_SELECTORS.channel),
      description: read(YOUTUBE_SELECTORS.description),
    };
  }

  watch(listener: CaptionSurfaceListener): () => void {
    const { doc } = this.deps;
    const onMediaEvent = (event: Event): void => {
      if (!this.isMainVideo(event.target)) return;

      listener.onPlayhead(this.playheadMs(), event.type === "seeked");
    };
    const onNavigate = (): void => listener.onNavigate(this.videoId());
    const stopTimedtext = listenTimedtext(doc, (capture) => this.relayTrack(capture, listener));
    const observer = new MutationObserver((records) => this.observePressed(records, listener));

    doc.addEventListener("timeupdate", onMediaEvent, true);
    doc.addEventListener("seeked", onMediaEvent, true);
    doc.addEventListener(YOUTUBE_SELECTORS.navigateFinishEvent, onNavigate);
    observer.observe(doc.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: [PRESSED],
      attributeOldValue: true,
    });

    return () => {
      stopTimedtext();
      observer.disconnect();
      doc.removeEventListener("timeupdate", onMediaEvent, true);
      doc.removeEventListener("seeked", onMediaEvent, true);
      doc.removeEventListener(YOUTUBE_SELECTORS.navigateFinishEvent, onNavigate);
    };
  }

  loadCaptions(): void {
    const button = this.subtitlesButton();

    if (button === null || button.getAttribute(PRESSED) !== "false") return;

    this.turnedCaptionsOn = true;
    button.click();
  }

  restoreCaptions(): void {
    if (!this.turnedCaptionsOn) return;

    this.turnedCaptionsOn = false;
    const button = this.subtitlesButton();

    if (button === null || button.getAttribute(PRESSED) !== "true") return;

    this.restoring = true;
    button.click();
  }

  hideNative(hidden: boolean): void {
    this.installStyle();
    this.player()?.classList.toggle(YOUTUBE_SELECTORS.nativeHiddenClass, hidden);
  }

  private relayTrack(capture: TimedtextCapture, listener: CaptionSurfaceListener): void {
    const parsed = parseTimedtext(capture);

    if (parsed.isFailure) {
      console.debug("lambe: timedtext capture dropped", parsed.getError());
      return;
    }

    const track = parsed.getValue();
    const current = this.videoId();

    if (current.isNone() || current.unwrap().value !== track.videoId.value) return;

    listener.onTrack(track);
  }

  private observePressed(records: MutationRecord[], listener: CaptionSurfaceListener): void {
    const turnedOff = records.some(
      (record) =>
        record.target instanceof Element &&
        record.target.matches(YOUTUBE_SELECTORS.subtitlesButton) &&
        record.oldValue === "true" &&
        record.target.getAttribute(PRESSED) === "false",
    );

    if (!turnedOff) return;

    if (this.restoring) {
      this.restoring = false;
      return;
    }

    this.turnedCaptionsOn = false;
    listener.onCaptionsOff();
  }

  private isMainVideo(target: EventTarget | null): boolean {
    return target instanceof Element && target.matches(YOUTUBE_SELECTORS.video);
  }

  private currentMetadata(): Element | null {
    const metadata = this.deps.doc.querySelector(YOUTUBE_SELECTORS.metadata);
    const shown = metadata?.getAttribute(YOUTUBE_SELECTORS.metadataVideoAttribute);
    const current = this.videoId()
      .map((id) => id.value)
      .toUndefined();

    return shown !== undefined && shown === current ? metadata : null;
  }

  private player(): Element | null {
    return this.deps.doc.querySelector(YOUTUBE_SELECTORS.player);
  }

  private subtitlesButton(): HTMLElement | null {
    const button = this.player()?.querySelector(YOUTUBE_SELECTORS.subtitlesButton);

    return button instanceof HTMLElement ? button : null;
  }

  private installStyle(): void {
    const { doc } = this.deps;

    if (doc.getElementById(YOUTUBE_SELECTORS.styleId) !== null) return;

    const style = doc.createElement("style");
    style.id = YOUTUBE_SELECTORS.styleId;
    style.textContent = HIDE_NATIVE_CSS;
    doc.head.append(style);
  }
}
