/* ============================================================================
   Sample briefs.

   The hardest moment in this app is not the build and not the key: it is the
   empty textarea. Someone who has just installed a website builder has to
   invent a business before they can see what it does, and the ones who cannot
   are the ones who leave.

   So each kind gets one real brief, in a real voice, with numbers and names —
   the same kind of copy the app asks for — that fills the whole form in one
   click. Press it, press Continue, press Build. Four seconds to the thing the
   product is actually selling.

   ── why these are not "mock data" ─────────────────────────────────────────
   The rule in this repo is that the app contains no example content, because a
   page that invents a pottery in Dammam is a lie. This is different in one
   specific way, and the difference is the whole justification:

     · it is OPT-IN. Nothing loads it but a button whose label says "sample".
     · it is LABELLED. The form says, in place, that these are sample answers
       and that they are meant to be replaced.
     · it never reaches the build unless the user presses Continue with it
       still in the box — and that is the same consent as typing it.

   A sample brief answering "what should I type here" is a demonstration, not a
   claim about the user's business. The invented-pottery failure was the app
   filling a field the user had left blank and then building from it.
   ========================================================================== */

import type { AnswerMap } from './gemini';
import type { SiteKind } from './spec';
import { KIND_BRIEFS } from './questions';

export type Sample = {
  /** the name that goes in the nav and the tab */
  name: string;
  /** the one-box brief — what the model reads as the description */
  brief: string;
  /** answers to the per-kind questions, by id */
  answers: AnswerMap;
};

/**
 * Eight briefs, one per kind.
 *
 * Each is written the way the placeholder asks the user to write: what the
 * place is, what it costs, when it opens, how you buy. Small, specific and
 * unglamorous, because that is the register the copy guard is looking for.
 */
export const SAMPLES: Record<SiteKind, Sample> = {
  store: {
    name: 'Kiln & Co.',
    brief:
      'Hand-thrown stoneware, made in a two-person workshop in Dammam. Twelve pieces in the range, all mugs, bowls and plates, priced from SAR 65 to SAR 220. Orders come by message from the page, delivered anywhere in the Gulf in 3 to 5 days, free over SAR 300. Everything is food-safe and dishwasher-safe, and each piece is stamped with the date it was thrown.',
    answers: {
      catalogue: '3–8, a tight edit',
      currency: 'SAR 65',
      shipping:
        'Ships in 3–5 days across the Gulf, free over SAR 300. Returns accepted for 14 days, unused and in the original box.',
      checkout: 'Direct message or email',
      origin: 'Dammam, Saudi Arabia',
    },
  },

  restaurant: {
    name: 'Falcon Coffee',
    brief:
      'A twenty-seat coffee bar on the corniche, open 7am to 6pm Saturday to Thursday. One espresso machine, two filter options, and a short food menu: a cheese manakish, a date cake, a breakfast plate. Coffee from SAR 14, plates from SAR 28. Walk-ins for coffee, and a table can be booked by phone for four or more. Last order at 5:30pm.',
    answers: {
      service: 'Walk-in only',
      menu:
        'Espresso 14 · Flat white 18 · Filter of the day 20 · Cheese manakish 28 · Date cake 22 · Breakfast plate 42, all day until 5:30pm.',
      hours: '7am–6pm, Saturday to Thursday. Closed Friday.',
      address: 'Corniche Road, Dammam, next to the boat club',
      dietary: 'Oat and almond milk at no extra charge. Two vegetarian plates, no gluten-free bread, and everything is prepared in one small kitchen.',
    },
  },

  portfolio: {
    name: 'Hana Al-Sayed',
    brief:
      'Product designer in Riyadh, 6 years in, working on interfaces for health and logistics companies. 4 projects want showing, each with one clear before-and-after problem. Available for freelance from March, two days a week, and best reached by email at hello@hanaalsayed.com.',
    answers: {
      discipline: 'Design',
      projects:
        'Four projects: a clinic booking flow rebuilt around a two-step form, a pharmacy delivery app, an internal dashboard for a logistics firm, and a redesign of a bank statement as a single page. Each one started from a measurable problem and ended with a number.',
      clients: 'A private clinic group, a pharmacy chain, a logistics company and a bank, all in Saudi Arabia.',
      available: true,
    },
  },

  landing: {
    name: 'Ledgerly',
    brief:
      'A single page for a tool that turns a bank statement into a categorised spending report. The action is signing up free, no card. The strongest fact is that it reads a PDF statement and sorts 400 transactions in about nine seconds, on the user\'s own machine, so the statement is never uploaded.',
    answers: {
      action: 'Sign up free',
      audience: 'Freelancers and one-person studios in the Gulf who dread the end of the quarter.',
      proof:
        'It reads a PDF statement and sorts 400 transactions in about nine seconds, in the browser. Nothing is uploaded, because there is no server.',
      objection:
        'The obvious worry is handing a bank statement to a stranger. Here it never leaves the machine — you can watch the network tab stay empty while it works.',
    },
  },

  saas: {
    name: 'Ledgerly',
    brief:
      'Bookkeeping for freelancers in the Gulf. It imports a bank statement, categorises every transaction, and produces a one-page summary you can hand to an accountant. Free for one account, SAR 39 a month for unlimited accounts and invoice matching, SAR 99 for accountants managing up to 20 clients.',
    answers: {
      buyer: 'Freelancers and one-person studios in the Gulf, and the accountants who tidy up after them.',
      pricing:
        'Free for one account. SAR 39 a month for unlimited accounts and invoice matching. SAR 99 a month for accountants handling up to 20 clients. No card for the free tier.',
      integrations: 'Bank statement PDFs from the six largest Gulf banks, and a CSV export for anything else.',
      differentiator:
        'It runs in the browser on the statement you give it — no upload, no account for the free tier, and the summary is a file you keep.',
    },
  },

  agency: {
    name: 'Northline Studio',
    brief:
      'A four-person studio in Beirut doing brand identity and web builds for restaurants and small hotels. Identity from USD 4,000, website from USD 6,000, and a retainer at USD 1,500 a month. Six named clients want showing, including a bakery and a guesthouse. Enquiries go to studio@northline.example and get a reply within two working days.',
    answers: {
      services:
        'Brand identity, website builds, and a monthly retainer covering both. Identity includes naming, a wordmark, a short type system and a one-page guide.',
      size: '2–10',
      work:
        'Six projects to show: a bakery in Mar Mikhael, a guesthouse in Byblos, a coffee roaster, a bookshop, a small hotel group and a wine importer. Each one is identity plus site, with the before image beside the after.',
      engagement: 'Both',
    },
  },

  blog: {
    name: 'Slow Water',
    brief:
      'A blog about swimming in open water in the Gulf: where to swim, when the tide and heat allow it, and how to do it safely. Two posts a month, each 900 to 1,200 words, written in the first person with photographs. No sponsor money, no gear reviews, no affiliate links.',
    answers: {
      cadence: 'Monthly',
      pieces:
        'Six posts to start: a first swim at half moon bay, reading a tide table, what the heat does to a two hour swim, the shortest safe entry points along the eastern coast, a beginner\'s kit that costs under SAR 300, and a winter route from Dammam to Jubail.',
      about:
        'Written by one person who swims here three mornings a week. The point is to say where it is actually safe and when, because the tide and the heat decide that, not the map.',
    },
  },

  event: {
    name: 'Dammam Design Day',
    brief:
      'A one-day conference on 14 March at the Dammam Chamber building, 200 seats. Six talks on type, interfaces and local design practice, three workshops in the afternoon, and a closing panel. Tickets are SAR 180 for the full day and SAR 120 for students, including lunch. Registration by email with a name and ticket type; payment at the door.',
    answers: {
      when: '14 March, 9am to 6pm',
      programme:
        'Registration at 9, six twenty-minute talks through the morning on type, interfaces and local practice, lunch at 1, three parallel workshops from 2 to 4:30, and a closing panel at 5.',
      tickets:
        'SAR 180 for the full day including lunch. SAR 120 for students with a valid card. 200 seats, and the workshops cap at 25 each.',
      speakers: 'Six speakers from studios in Riyadh, Beirut and Dubai, and three workshop leaders from Dammam.',
    },
  },

  docs: {
    name: 'Ledgerly Docs',
    brief:
      'Documentation for a bookkeeping tool used by freelancers. Readers are non-technical: they know what a bank statement is and nothing about APIs. Five sections wanted: getting started, importing a statement, fixing a wrong category, exporting for an accountant, and a short FAQ. Version 2.4, updated this month.',
    answers: {
      audience: 'End users',
      topics:
        'Getting started, importing a statement, fixing a category that came out wrong, exporting a summary for an accountant, and a short FAQ about where the data lives.',
      install: 'No install. Open the app in a browser and paste a key once.',
      support: 'One email address, answered within two working days.',
    },
  },

  custom: {
    name: 'The Reading Room',
    brief:
      'A small library of 300 books in a converted shop in Al Khobar, open to members for SAR 120 a year. Members borrow two books at a time for two weeks, there is a reading table with coffee, and a book club meets on the last Thursday of every month. Visiting is free; joining is by email.',
    answers: {
      audience: 'People in Al Khobar who read in English and Arabic and want somewhere quiet to do it.',
      must:
        'What the library is and where, the membership price and what it includes, how borrowing works, when the book club meets, and how to join by email.',
      tone: 'Plain and factual',
    },
  },
};

/** The brief for a kind, filled in with the kind's own question ids. */
export function sampleFor(kind: SiteKind): Sample {
  return SAMPLES[kind];
}

/**
 * Turn a sample into the answer map the funnel uses.
 *
 * Only answers the kind actually asks for are copied, so a sample that carries
 * a field for a different kind cannot smuggle it into the prompt. Both the id
 * list and the shape of the map are checked at build time by samples-test.
 */
export function sampleAnswers(kind: SiteKind): AnswerMap {
  const s = sampleFor(kind);
  const asked = new Set(KIND_BRIEFS[kind].questions.map((q) => q.id));
  const out: AnswerMap = { name: s.name, prompt: s.brief };
  for (const [id, value] of Object.entries(s.answers)) {
    if (!asked.has(id)) continue;
    out[id] = value;
  }
  return out;
}
