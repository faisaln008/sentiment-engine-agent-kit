/** Word-boundary lexicon (never substring: "no" must not match "know"). Input is lower-cased, apostrophes normalised. */
const w = (alts: string): RegExp => new RegExp(`\\b(?:${alts})\\b`);

export const ULTIMATUM = w(
  "take it or leave it|walk(?:ing)? away|last offer|final offer|or else|non-negotiable|last chance|or we (?:walk|go elsewhere)|you(?:'ll| will) regret|(?:sign|decide|accept) (?:by|today|now)",
);
export const BLAME = w(
  'your fault|your mistake|incompetent|ridiculous|waste of (?:my|our) time|you always|you never|how dare you',
);
export const SARCASM_STRONG = w(
  'oh,? (?:great|wonderful|brilliant|perfect|fantastic)|yeah,? right|just what we needed|thanks a lot|how generous|how thoughtful|what a surprise|sure,? because|love how',
);
export const INTENSIFIER = w('totally|absolutely|obviously|truly|so very|sure|really|clearly');
export const CONTEXT_NEG = w('another|again|still|as usual|once more|yet more|only|just');
export const DEFLECT = w(
  'legal|procurement|board|next quarter|circle back|internally|get back to you|take (?:that|it) offline|above my (?:pay ?grade|level)|loop in|run it by|check with|not my call|stakeholders?|in due course|at some point|down the (?:road|line)',
);
export const APPEASE = w(
  "whatever works(?: best)? for you|no worries|no problem at all|i(?:'m| am) (?:so |very )?sorry|apologi[sz]e|happy to (?:waive|drop|go lower|match|cover)|we can (?:drop|waive|absorb)|whatever you(?: need| want| prefer)|you(?:'re| are) right,? of course|don't worry|fine by me|i can live with|let me make it up",
);
export const NEGATIVE = w(
  "no|not|never|can't|cannot|won't|don't|unacceptable|disappoint\\w*|concern\\w*|problem|wrong|too (?:high|expensive|low)|refuse\\w*|reject\\w*|unhappy|frustrat\\w*|issues?",
);
export const POSITIVE = w(
  'great|good|glad|happy|agree\\w*|love|excited|thank\\w*|appreciate\\w*|perfect|pleased|sounds good|works for us|wonderful|fantastic|brilliant',
);
export const BENIGN_NO = /\bno problem\b/g;

export const normalise = (t: string): string => t.toLowerCase().replace(/[‘’]/g, "'");
