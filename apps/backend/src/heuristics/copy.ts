import type { Sentiment, Speaker } from '@app/contracts';

interface Copy {
  intent: string;
  mitigation: string;
}

/** Speaker-aware canned copy (<= 60 / <= 120 chars). counterpart: how to respond; candidate: coaching. */
export const COPY: Record<Sentiment, Record<Speaker, Copy>> = {
  aggressive: {
    counterpart: {
      intent: 'pressure_via_ultimatum',
      mitigation:
        'Acknowledge the deadline, restate your key term calmly, and propose one concrete next step',
    },
    candidate: {
      intent: 'pressure_via_ultimatum',
      mitigation:
        'Lower the heat: restate the shared goal and ask what would make the deal workable',
    },
  },
  sarcastic: {
    counterpart: {
      intent: 'criticism_via_mock_praise',
      mitigation:
        'Name the real concern behind the sarcasm and ask them to state the issue directly',
    },
    candidate: {
      intent: 'frustration_via_mock_praise',
      mitigation:
        'Drop the sarcasm and state the objection plainly so the counterpart can answer it',
    },
  },
  deflecting: {
    counterpart: {
      intent: 'deflection_via_third_party_delay',
      mitigation: 'Ask who decides and propose a fixed date this week to resolve the open point',
    },
    candidate: {
      intent: 'avoidance_via_process_shield',
      mitigation:
        'Give a concrete owner and date instead of deferring, or the counterpart will push harder',
    },
  },
  appeasement: {
    counterpart: {
      intent: 'tension_relief_via_concession',
      mitigation: 'Bank the concession, then ask for something in return before moving on',
    },
    candidate: {
      intent: 'concession_without_trade',
      mitigation:
        "You're conceding without a trade: anchor on value and ask for something in return",
    },
  },
  negative: {
    counterpart: {
      intent: 'objection_to_current_terms',
      mitigation: 'Validate the objection, then ask which single term would change their answer',
    },
    candidate: {
      intent: 'resistance_to_terms',
      mitigation: 'Pair the objection with an alternative proposal so the discussion keeps moving',
    },
  },
  positive: {
    counterpart: {
      intent: 'none_detected',
      mitigation: 'Reinforce the alignment and lock in a concrete next step with an owner and date',
    },
    candidate: {
      intent: 'none_detected',
      mitigation: 'Good rapport: confirm the agreed terms in writing before moving on',
    },
  },
  neutral: {
    counterpart: {
      intent: 'none_detected',
      mitigation: 'Ask one open question to surface their actual position on price or timing',
    },
    candidate: {
      intent: 'none_detected',
      mitigation: 'Tie this point back to your key term and ask for their position',
    },
  },
};
