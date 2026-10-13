"use client";

import { useCallback, useState } from "react";
import { useVerificationConfig } from "../context/VerificationConfigContext";
import { useVerificationContext } from "../context/VerificationContext";
import {
	captureCheckProblems,
	type CaptureProblem,
	type CaptureSide,
} from "../lib/document-capture-check";

/**
 * The capture check for the document step: ask the server about each uploaded
 * side, and hold what the applicant is asked to fix until they retake or carry on.
 */
export function useDocumentCaptureCheck() {
	const config = useVerificationConfig();
	const { state } = useVerificationContext();
	const [problems, setProblems] = useState<CaptureProblem[] | null>(null);
	const clear = useCallback(() => setProblems(null), []);

	const check = useCallback(
		async (uploads: Array<{ side: CaptureSide; mediaId: string }>): Promise<CaptureProblem[]> => {
			const idType = state.selectedIdType;
			const country = config.country;
			if (!idType || !country || uploads.length === 0) return [];
			// A business flow's document belongs to the applicant's own
			// verification, which submits under the mapped applicant workflow.
			const business = config.subjectType === "business";
			const workflowId = business ? config.applicantWorkflowId : config.workflowId;
			const sessionId = business ? null : state.sessionId;
			const results = await Promise.all(
				uploads.map(async ({ side, mediaId }) => {
					const result = await config.api.checkDocumentCapture({
						mediaId,
						side,
						country,
						idType,
						...(workflowId ? { workflowId } : {}),
						...(sessionId ? { sessionId } : {}),
					});
					// The side is the one asked about, whatever came back.
					return result ? { ...result, side } : null;
				}),
			);
			return captureCheckProblems(results);
		},
		[config, state.selectedIdType, state.sessionId],
	);

	return { problems, setProblems, clear, check };
}
