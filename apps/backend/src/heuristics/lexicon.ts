/** Word-boundary lexicon (never substring: "no" must not match "know"). Input is lower-cased, apostrophes normalised. */
const w = (alts: string): RegExp => new RegExp(`\\b(?:${alts})\\b`);

export const ULTIMATUM = w(
  "take it or leave it|walk(?:ing)? away|last offer|final offer|or else|non-negotiable|last chance|or we (?:walk|go elsewhere)|either\\b[^.?!]{0,80}\\bor (?:we|i)(?:'ll| will| are| am|'re)? (?:walk|go|leave|move|sign with|take our business|pull|cancel|terminate)|wasting (?:each other's|our|my) time|you(?:'ll| will) regret|(?:sign|decide|accept|respond|confirm) (?:by|before) (?:\\w+day|tomorrow|noon|midnight|the end of|end of|next week)",
);
export const BLAME = w(
  'your fault|your mistake|incompetent|ridiculous|waste of (?:my|our) time|you always|you never(?! know)|how dare you',
);
export const SARCASM_STRONG = w(
  'oh,? (?:great|wonderful|brilliant|perfect|fantastic)|yeah,? right|just what we needed|how generous|how thoughtful|what a surprise|sure,? because|love how',
);
export const INTENSIFIER = w('totally|absolutely|obviously|truly|so very|really|clearly');
export const CONTEXT_NEG = w('another|again|still|as usual|once more|yet more|only|just');
export const DEFLECT = w(
  '(?:legal|procurement|the board|stakeholders?|steering group|finance|compliance)(?: team| department| office)? (?:needs?|has|have|must|will|should|would|wants?) (?:to )?(?:review|weigh|approve|look|check|clear|decide|sign|get|be|see)|next quarter|circle back|sometime (?:later|soon|next (?:week|month|quarter|year))|looking into (?:it|this|that)|take (?:that|this|it) back to|(?:pick|revisit|follow up on)(?: this| that| it)?(?: up)? (?:next|later|soon)|conversation for (?:later|another (?:day|time)|after)|will revert|touch base|internally|get back to you|take (?:that|it) offline|above my (?:pay ?grade|level)|loop in|run it by|check with|not my call|in due course|at some point|down the (?:road|line)',
);
export const APPEASE = w(
  "whatever works(?: best)? for you|no worries|no problem at all|(?:i|we)(?:'m|'re| am| are) (?:so |very |really |truly )?sorry|apologi[sz]e|my apologies|we (?:completely|totally|fully) understand|i(?:'m| am) sure we can|let me see what i can do|(?:we|i)(?:'ll| will| can| could) (?:knock|throw in|credit|refund|discount|waive)|happy to (?:waive|drop|go lower|match|cover)|we can (?:drop|waive|absorb)|whatever you(?: need| want| prefer)|you(?:'re| are) right,? of course|don't worry|fine by me|i can live with|let me make it up",
);
export const NEGATIVE = w(
  "no|not|never|can't|cannot|won't|don't|unacceptable|disappoint\\w*|concern\\w*|problem|wrong|too (?:high|expensive|low)|refuse\\w*|reject\\w*|unhappy|frustrat\\w*|issues?",
);
export const POSITIVE = w(
  'great|good|glad|happy|agree\\w*|love|excited|thank\\w*|appreciate\\w*|perfect|pleased|sounds good|works for us|wonderful|fantastic|brilliant',
);
/** Negated positives ("not good") are negative; negated negatives ("not bad at all") are positive (T1). */
export const NEG_POS = w(
  "(?:not|never|isn't|aren't|wasn't|don't|doesn't|didn't) (?:very |that |so |really )?(?:good|great|happy|acceptable|fair|enough|okay|ok|helpful|workable)",
);
export const NEG_NEG = w(
  "(?:not|never|isn't|aren't|wasn't) (?:very |that |so )?(?:bad|terrible|awful)(?: at all)?",
);
/** "we don't want to walk away" is not a walk-away threat (T1). */
export const NEGATED_WALK = w(
  "(?:don't|do not|doesn't|won't|will not|wouldn't|would not|not|never|no need to|no reason to) (?:want to |wish to |intend to |plan to )?walk(?:ing)? away",
);
export const BENIGN_NO = /\bno problem\b/g;
const g = (re: RegExp): RegExp => new RegExp(re.source, 'g');
export const NEG_POS_G = g(NEG_POS);
export const NEG_NEG_G = g(NEG_NEG);
/** "I'm sorry, but that's unacceptable" is pushback, not appeasement. */
export const APOLOGY_BUT_G = /\b(?:sorry|apologi[sz]e)\b[^.?!]{0,20}\b(?:but|however)\b/g;
export const NEGATED_WALK_G = g(NEGATED_WALK);

export const normalise = (t: string): string => t.toLowerCase().replace(/[‘’]/g, "'");
