import { useEffect, useRef } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';
import { countdownText } from '../lib/christmas';
import { SignIn } from './SignIn';

const IMG = `${import.meta.env.BASE_URL}landing/`;

interface Feature {
  icon: IconName;
  title: string;
  text: string;
  image: string;
  alt: string;
}

// Screens are real screenshots of the app with a made-up family (see docs/landing-page.md).
const FEATURES: Feature[] = [
  {
    icon: 'users',
    title: 'Everyone you shop for, in one place',
    text: 'Make groups for family, kids, pets, coworkers and friends. Every person gets a card showing what is bought and what is left to spend.',
    image: 'screen-groups.webp',
    alt: 'Groups of people on the list, each with a budget bar and a card for every person',
  },
  {
    icon: 'gift',
    title: 'Every gift, from idea to given',
    text: 'Pictures, prices and stores on every card. Move a gift from idea to ordered, shipped, wrapped and given, and see what your partner just added.',
    image: 'screen-gifts.webp',
    alt: 'A list of gift cards with status badges, progress strips and a "new from Jordan" banner',
  },
  {
    icon: 'sparkle',
    title: 'One present, a few people, split fairly',
    text: 'Bought a box of four soaps? Share it between four people and the cost is divided. Each person’s card shows their part.',
    image: 'screen-shared.webp',
    alt: 'A soap set shared with three other people, showing each person’s share of the cost',
  },
  {
    icon: 'link',
    title: 'Share from any shop in two taps',
    text: 'Found it online? Share the page to Gift-List and the name, store and link are filled in for you. Just pick who it is for.',
    image: 'screen-add.webp',
    alt: 'The new gift idea form already filled in from a shared shop link',
  },
  {
    icon: 'settings',
    title: 'Made for both of you',
    text: 'Invite your partner and you both see and edit the same list, live. Turn on notifications, add the phone widget and put Gift-List on your Home Screen.',
    image: 'screen-settings.webp',
    alt: 'The settings menu with the list, who is on it, notifications, sharing and the phone widget',
  },
];

const MORE: { icon: IconName; title: string; text: string }[] = [
  { icon: 'star', title: 'A budget that tells the truth', text: 'See budget, spent, planned and left at a glance. It turns red the moment you go over.' },
  { icon: 'heart', title: 'Gentle nudges', text: 'Get a note when your partner adds or buys a gift, when you pass your budget, and as Christmas gets close.' },
  { icon: 'tree', title: 'The countdown', text: 'Days to Christmas and gifts still open, always at the top.' },
  { icon: 'check', title: 'Private by default', text: 'Your list is yours. Only the person you add can see it.' },
];

export function Landing({ notice }: { notice?: string | null }) {
  const start = useRef<HTMLElement>(null);

  const goToSignIn = () => {
    start.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    window.setTimeout(() => start.current?.querySelector<HTMLElement>('input, button.chip')?.focus({ preventScroll: true }), 400);
  };

  // Someone who came back from a failed email link should land on the sign-in card.
  useEffect(() => {
    if (notice) start.current?.scrollIntoView();
  }, [notice]);

  return (
    <div className="landing">
      <header className="landing-bar">
        <div className="landing-brand">
          <Logo size={36} />
          <span className="landing-name">Gift-List</span>
        </div>
        <button type="button" className="btn small" onClick={goToSignIn}>
          Sign in
        </button>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-hero-text">
            <p className="landing-pill">{countdownText()}</p>
            <h1 id="hero-title" className="display">
              Christmas, sorted. <span>Together.</span>
            </h1>
            <p className="landing-lead">
              The shared gift list and budget for you and your partner. Ideas, prices, pictures and who is buying what, all in one
              festive place.
            </p>
            <div className="landing-cta">
              <button type="button" className="btn primary big" onClick={goToSignIn}>
                Make your list, it’s free
              </button>
              <p className="muted small">No app store. Works on any phone.</p>
            </div>
          </div>
          <Phone src="screen-people.webp" alt="The Gift-List home screen with the Christmas countdown, budget and groups of people" eager />
        </section>

        <div className="candy-rule" aria-hidden="true" />

        <section className="landing-features" aria-label="What Gift-List does">
          {FEATURES.map((f, i) => (
            <article key={f.title} className={`landing-feature${i % 2 ? ' flip' : ''}`}>
              <div className="landing-feature-text">
                <span className="landing-icon" aria-hidden="true">
                  <Icon name={f.icon} size={26} />
                </span>
                <h2 className="display">{f.title}</h2>
                <p>{f.text}</p>
              </div>
              <Phone src={f.image} alt={f.alt} />
            </article>
          ))}
        </section>

        <section className="landing-more" aria-labelledby="more-title">
          <h2 id="more-title" className="display">
            And the little things
          </h2>
          <ul>
            {MORE.map((m) => (
              <li key={m.title}>
                <span className="landing-icon small" aria-hidden="true">
                  <Icon name={m.icon} size={22} />
                </span>
                <div>
                  <h3>{m.title}</h3>
                  <p>{m.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-start" id="start" ref={start} aria-labelledby="start-title">
          <h2 id="start-title" className="display">
            Ready to start your list?
          </h2>
          <p className="landing-lead">It takes about a minute. We will email you a link, no password needed.</p>
          <SignIn notice={notice} embedded />
        </section>
      </main>

      <footer className="landing-foot">
        <p className="muted small">Made with care for the holidays. Your list is private and only shared with the person you add.</p>
      </footer>
    </div>
  );
}

function Phone({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div className="phone">
      <img
        src={`${IMG}${src}`}
        alt={alt}
        width={390}
        height={844}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </div>
  );
}
