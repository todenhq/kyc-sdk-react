"use client";

import { ArrowLeft, Loader2 } from '../components/icons';
import { Button } from "../components/ui/button";
import { useText } from '../i18n';

// ---------------------------------------------------------------------------
// Presentational screens for SubmittedStep (loading / error / success),
// extracted so the step file stays within the 200-line rule. Pure render —
// all state and submission logic lives in SubmittedStep.tsx.
// ---------------------------------------------------------------------------

/**
 * The one loading screen after the capture. Every wait renders THIS, with
 * copy from lib/result-copy.ts (`describeWaiting`): the liveness hand-over,
 * the submission and, on a flow that waits for its verdict, the status poll
 * all show one loader under one title. A retry in flight swaps only the
 * description, in the warning colour.
 */
export function SubmittingScreen({
	title,
	description,
	retrying = false,
}: {
	title: string;
	description: string;
	retrying?: boolean;
}) {
	return (
		<div className='flex flex-col items-center justify-center gap-6 py-12 animate-fade-in'>
			<div className='relative flex items-center justify-center'>
				<div className='absolute h-20 w-20 rounded-full border-2 border-primary/30 animate-pulse-ring' />
				<div className='flex h-14 w-14 items-center justify-center rounded-full bg-primary/10'>
					<Loader2 className='h-7 w-7 animate-spin text-primary' />
				</div>
			</div>
			<div className='text-center space-y-2'>
				<p className='text-base font-medium'>{title}</p>
				<p className={retrying ? 'text-sm text-amber-700 dark:text-amber-400' : 'text-sm text-muted-foreground'}>
					{description}
				</p>
			</div>
		</div>
	);
}

export function SubmitErrorScreen({
	message,
	onRetry,
	onClose,
	onGoBack,
}: {
	message: string;
	onRetry: () => void;
	onClose: () => void;
	/**
	 * Back to the step that can fix the refusal (lib/submit-recovery.ts). When
	 * present it is the primary action, beside Close, and Try Again is not
	 * offered: the application is not lost, only incomplete, and resubmitting
	 * it unchanged would be refused again.
	 */
	onGoBack?: () => void;
}) {
	const t = useText();
	return (
		<div className='flex flex-col items-center gap-6 py-8 animate-fade-in'>
			<div className='flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10'>
				<svg
					className='h-10 w-10 text-destructive'
					viewBox='0 0 24 24'
					fill='none'
					stroke='currentColor'
					strokeWidth='2.5'
					strokeLinecap='round'
					strokeLinejoin='round'>
					<circle cx='12' cy='12' r='10' />
					<line x1='12' y1='8' x2='12' y2='12' />
					<line x1='12' y1='16' x2='12.01' y2='16' />
				</svg>
			</div>

			<div className='text-center space-y-1'>
				<h2 className='text-xl font-semibold font-heading'>
					{t('result.error.title')}
				</h2>
				<p className='text-sm text-muted-foreground'>{message}</p>
			</div>

			{onGoBack ? (
				<div className='flex w-full gap-3'>
					<Button variant='outline' className='flex-1' onClick={onClose}>
						{t('common.close')}
					</Button>
					<Button className='flex-1 gap-2' onClick={onGoBack}>
						<ArrowLeft className='h-4 w-4' aria-hidden='true' />
						{t('result.error.goBackButton')}
					</Button>
				</div>
			) : (
				<>
					<Button className='w-full' onClick={onRetry}>
						{t('result.error.tryAgainButton')}
					</Button>

					<Button variant='ghost' className='w-full' onClick={onClose}>
						{t('common.close')}
					</Button>
				</>
			)}
		</div>
	);
}

/**
 * Terminal affordance under the success message: a button, or — on hosted
 * links with no completion redirect, where a button would have nothing to do
 * (`window.close()` can't close a user-opened tab) — a static note instead.
 */
export type SubmitSuccessAction =
	| { label: string; onClick: () => void }
	| { note: string };

/**
 * The mark at the top of the terminal screen.
 *
 * A submission gets the tick. An application that came back DECLINED must not:
 * a returning applicant was being shown a green tick over a decision that had
 * gone against them, which is the screen contradicting itself. An `error` is
 * ours rather than theirs, so it is neutral instead of negative.
 */
export type TerminalTone = 'success' | 'declined' | 'neutral';

const TONE: Record<TerminalTone, { ring: string; color: string; path: string }> = {
	success: {
		ring: 'bg-[var(--verification-success)]/10',
		color: 'text-[var(--verification-success)]',
		path: 'M4 12l5 5L20 6',
	},
	// A cross, drawn with the same stroke and the same animation, so the screen
	// reads as one design rather than a different screen for bad news.
	declined: {
		ring: 'bg-[var(--verification-error)]/10',
		color: 'text-[var(--verification-error)]',
		path: 'M6 6l12 12M18 6L6 18',
	},
	neutral: { ring: 'bg-muted', color: 'text-muted-foreground', path: 'M12 8v5M12 16.5v.5' },
};

export function SubmitSuccessScreen({
	title,
	description,
	action,
	extra,
	tone = 'success',
}: {
	title: string;
	description: string;
	/** The terminal affordance; absent when the `doneButton` option hid it (the
	 *  host app dismisses the flow itself, so the screen stays until it does). */
	action?: SubmitSuccessAction;
	/** Optional block between the message and the terminal action (e.g. the KYB
	 *  key-people invite links). */
	extra?: React.ReactNode;
	/** What happened. Defaults to success — a fresh submission always has. */
	tone?: TerminalTone;
}) {
	const marks = TONE[tone];
	return (
		<div className='flex flex-col items-center gap-6 py-6 animate-fade-in'>
			<div className={`flex h-20 w-20 items-center justify-center rounded-full ${marks.ring}`}>
				<svg
					className={`h-10 w-10 ${marks.color}`}
					viewBox='0 0 24 24'
					fill='none'
					stroke='currentColor'
					strokeWidth='3'
					strokeLinecap='round'
					strokeLinejoin='round'>
					<path
						d={marks.path}
						strokeDasharray='100'
						strokeDashoffset='100'
						className='animate-checkmark'
					/>
				</svg>
			</div>

			<div className='text-center space-y-2'>
				<h2 className='text-xl font-semibold font-heading'>{title}</h2>
				<p className='text-sm text-muted-foreground'>{description}</p>
			</div>

			{extra}

			{action === undefined ? null : 'note' in action ? (
				<p className='text-sm text-muted-foreground text-center'>{action.note}</p>
			) : (
				<Button className='w-full' onClick={action.onClick}>
					{action.label}
				</Button>
			)}
		</div>
	);
}
