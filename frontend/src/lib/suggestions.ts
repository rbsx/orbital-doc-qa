// First questions a lawyer typically asks, by document type, guessed from
// filenames. A cheap starting point with no model call; the answers still come
// from the documents, with citations.
const BY_TYPE: Array<{ match: RegExp; questions: string[] }> = [
	{
		match: /lease|tenancy/i,
		questions: [
			"What is the rent, and when is it reviewed?",
			"Can the tenant end the lease early, and on what conditions?",
			"What are the tenant's repair and insurance obligations?",
		],
	},
	{
		match: /title|register/i,
		questions: [
			"Who is the registered owner?",
			"Are there any charges, restrictions or covenants on the title?",
		],
	},
	{
		match: /survey|measure/i,
		questions: [
			"What floor areas were measured?",
			"Did the survey find any defects?",
		],
	},
	{
		match: /environment|contamination|phase/i,
		questions: [
			"What contamination risks were identified?",
			"What further investigation is recommended?",
		],
	},
];

const MAX_SUGGESTIONS = 4;

export function suggestedQuestions(filenames: string[]): string[] {
	const several = filenames.length > 1;
	const suggestions = several
		? ["Do these documents contradict each other anywhere?"]
		: [];

	// One question per matching type in turn, so a lease and a title report
	// both get a look-in rather than the lease taking every slot.
	const matched = BY_TYPE.filter(({ match }) =>
		filenames.some((name) => match.test(name)),
	).map(({ questions }) => questions);
	for (let round = 0; matched.some((qs) => round < qs.length); round++) {
		for (const questions of matched) {
			const question = questions[round];
			if (question) suggestions.push(question);
		}
	}

	suggestions.push(
		several
			? "Summarise the key terms across these documents."
			: "Summarise the key terms of this document.",
		"What are the main risks for my client?",
	);
	return suggestions.slice(0, MAX_SUGGESTIONS);
}
