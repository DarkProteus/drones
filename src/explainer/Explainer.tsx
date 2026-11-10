import { useEffect, useState } from 'react';
import { MAVIC3_WIDE, footprint } from '../lib/camera';
import { CostFigure } from './CostFigure';
import { CoverageFigure } from './CoverageFigure';
import { FootprintFigure } from './FootprintFigure';
import { FrontFigure } from './FrontFigure';
import { HeroArt } from './HeroArt';
import { viewsPerPoint } from './model';
import { fmt } from './ui';

interface State {
  alt: number;
  front: number;
  side: number;
  wobble: boolean;
}

// Same defaults as the planner.
const DEFAULTS: State = { alt: 80, front: 80, side: 70, wobble: false };

const PRESETS = [
  { name: 'General mapping', front: 75, side: 60, body: 'Roads, buildings, quarries, construction sites: anything with plenty of texture and contrast.' },
  { name: 'Flat farmland', front: 80, side: 80, body: 'Rows of the same crop look alike from above, so the software needs more views to tell spots apart.' },
  { name: 'Forest and dense vegetation', front: 85, side: 85, body: 'Leaves move, canopies hide the ground, and every tree looks like its neighbour.' },
];

function readUrl(): State {
  const q = new URLSearchParams(location.search);
  const num = (key: string, min: number, max: number, fallback: number) => {
    const v = Number(q.get(key));
    return q.has(key) && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
  };
  return {
    alt: num('alt', 20, 150, DEFAULTS.alt),
    front: num('front', 0, 90, DEFAULTS.front),
    side: num('side', 0, 90, DEFAULTS.side),
    wobble: q.get('wobble') === '1',
  };
}

export function Explainer() {
  const [state, setState] = useState(readUrl);
  const [copied, setCopied] = useState(false);
  const set = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));
  const { alt, front, side, wobble } = state;
  const fp = footprint(MAVIC3_WIDE, alt);

  useEffect(() => {
    const q = new URLSearchParams({ alt: String(alt), front: String(front), side: String(side) });
    if (wobble) q.set('wobble', '1');
    history.replaceState(null, '', `?${q}${location.hash}`);
  }, [alt, front, side, wobble]);

  // Reveal blocks as they scroll in. A data attribute, not a class, so React re-renders don't strip it. Checking
  // position rather than intersection also reveals blocks a jump (anchor, preset button) skipped over.
  useEffect(() => {
    let raf = 0;
    const reveal = () => {
      raf = 0;
      const limit = innerHeight * 0.92;
      document.querySelectorAll('.article section > *, .presets > *, .cta').forEach((el) => {
        if (!el.hasAttribute('data-shown') && el.getBoundingClientRect().top < limit) el.setAttribute('data-shown', '');
      });
    };
    const onScroll = () => {
      raf ||= requestAnimationFrame(reveal);
    };
    reveal();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, []);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt('Copy this link', location.href);
    }
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    set({ front: p.front, side: p.side });
    document.getElementById('coverage')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      <nav className="topbar">
        <span className="read-progress" aria-hidden="true" />
        <a href="../" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Survey Mission Planner
        </a>
        <button type="button" className="ghost small" onClick={share}>
          {copied ? 'Link copied' : (
            <>
              Copy link<span className="wide-only"> to this view</span>
            </>
          )}
        </button>
      </nav>

      <header className="hero">
        <p className="kicker">An interactive explainer</p>
        <h1>How much should your drone photos overlap?</h1>
        <p className="dek">
          Mapping software builds maps and 3D models out of hundreds of overlapping photos. Too little overlap leaves holes. Too much
          drains batteries and processing time. Drag the sliders to see why the usual answer is <em>about 75 to 85 percent</em>.
        </p>
        <p className="byline">Numbers use the DJI Mavic 3 camera · about 6 minutes</p>
        <HeroArt />
      </header>

      <main className="article">
        <section>
          <h2>
            <span className="num">1</span>One photo, one footprint
          </h2>
          <p>
            A camera pointing straight down sees a rectangle of ground called its <strong>footprint</strong>. It grows in step with
            altitude. Fly twice as high and each side doubles, so each photo covers four times the area.
          </p>
          <p>
            Each pixel grows with it. The size of one pixel on the ground is the <strong>ground sample distance</strong>, or GSD. It
            sets the finest detail your map can show.
          </p>
          <FootprintFigure alt={alt} setAlt={(v) => set({ alt: v })} />
          <p>
            At {alt}&nbsp;m, one Mavic&nbsp;3 photo covers {fmt(fp.width)} × {fmt(fp.height)}&nbsp;m, and one pixel is {fmt(fp.gsdCm, 1)}
            &nbsp;cm wide. Choose the altitude for the detail you need first. Overlap comes next, and it works the same way at any height.
          </p>
        </section>

        <section>
          <h2>
            <span className="num">2</span>Front overlap: along the line
          </h2>
          <p>
            The drone flies a straight line and takes a photo every few metres. <strong className="t-front">Front overlap</strong> is the
            share of each photo that also appears in the next one.
          </p>
          <p>
            Photogrammetry works by finding the same feature in several photos taken from different places, then working out where it
            sits in 3D. Two photos are the bare minimum. In practice, some matches fail on shadows, moving leaves or repeating
            texture, so the software needs extra photos of each spot.
          </p>
          <FrontFigure alt={alt} front={front} setFront={(v) => set({ front: v })} />
          <p>
            With overlap <em>o</em>, each spot appears in about <span className="formula">1 ÷ (1 − o)</span> photos. 50% gives 2,
            75% gives 4, and 90% gives 10. Look at the left end of the strip: the first few metres of every line get fewer photos.
            That is why it pays to plan a little beyond the area you care about.
          </p>
        </section>

        <section>
          <h2>
            <span className="num">3</span>Side overlap: the whole picture
          </h2>
          <p>
            The drone turns around and flies the next line alongside the first.{' '}
            <strong className="t-side">Side overlap</strong> is how much neighbouring lines share. The two overlaps multiply, so the
            number of photos that see an average spot is
          </p>
          <p className="formula-block">
            1 ÷ ((1 − <span className="t-front">front</span>) × (1 − <span className="t-side">side</span>))
          </p>
          <CoverageFigure
            alt={alt}
            front={front}
            side={side}
            wobble={wobble}
            setFront={(v) => set({ front: v })}
            setSide={(v) => set({ side: v })}
            setWobble={(v) => set({ wobble: v })}
          />
          <p>
            On paper, even 0% overlap covers everything. Now set both sliders near zero and turn on <em>real-world wobble</em>. Gusts push
            the drone off its line, GPS drifts by a metre or two, and the shutter fires a little early or late. The wobble here is
            on the generous side so the effect is easy to see. Small slivers go unphotographed,
            and spots seen only once can't be reconstructed in 3D. Overlap is your safety margin.
          </p>
        </section>

        <section>
          <h2>
            <span className="num">4</span>What overlap costs
          </h2>
          <p>
            Overlap isn't free, and the two kinds cost different things. Side overlap adds <strong>flight lines</strong>, which adds
            flight time. Front overlap mostly adds <strong>photos</strong>. Past a point it costs time too. DJI Fly's shortest
            shooting interval is 2&nbsp;seconds, so to take photos closer together the drone has to fly slower.
          </p>
          <CostFigure alt={alt} front={front} side={side} />
          <p>
            That's why many pilots push front overlap higher than side overlap. Extra photos along the line are cheap. Extra lines
            are not.
          </p>
        </section>

        <section>
          <h2>
            <span className="num">5</span>Rules of thumb
          </h2>
          <p>
            Pix4D, a widely used photogrammetry package, publishes these starting points. Tap one to load it into the coverage map.
          </p>
          <div className="presets">
            {PRESETS.map((p) => {
              const active = p.front === front && p.side === side;
              return (
                <button type="button" key={p.name} className={`preset ${active ? 'active' : ''}`} onClick={() => applyPreset(p)}>
                  <span className="preset-name">{p.name}</span>
                  <span className="preset-values">
                    <span className="t-front">{p.front}%</span> front · <span className="t-side">{p.side}%</span> side
                  </span>
                  <span className="preset-body">{p.body}</span>
                  <span className="preset-foot">≈ {fmt(viewsPerPoint(p.front / 100, p.side / 100))} photos per spot</span>
                </button>
              );
            })}
          </div>
          <p>
            Treat these as minimums, not targets. Hills, trees and tall buildings call for more, especially at low altitude: anything
            that rises toward the drone fills more of each frame, so it shows up in fewer photos than the flat ground around it. If a site is expensive to revisit, add a margin. Reflying costs more than a
            few extra photos.
          </p>
        </section>

        <aside className="cta">
          <div>
            <h3>Ready to plan a flight?</h3>
            <p>
              Draw your area, pick altitude and overlap, and get a waypoint mission for DJI Fly. It runs in your browser and needs no
              account.
            </p>
          </div>
          <a className="button" href="../">
            Open the planner →
          </a>
        </aside>
      </main>

      <footer className="footer">
        <p>
          Camera: {MAVIC3_WIDE.name}, {MAVIC3_WIDE.sensorWidthMm} × {MAVIC3_WIDE.sensorHeightMm} mm sensor, {MAVIC3_WIDE.focalLengthMm}
          &nbsp;mm lens, {MAVIC3_WIDE.imageWidthPx} × {MAVIC3_WIDE.imageHeightPx} px. Overlap presets:{' '}
          <a href="https://support.pix4d.com/hc/en-us/articles/115002471546">Pix4D, Image acquisition</a>. Figures assume level ground
          and a camera pointing straight down.
        </p>
      </footer>
    </>
  );
}
