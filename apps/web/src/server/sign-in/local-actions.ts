'use server';
// The action of "be this made-up person" (step 2.96). LOCAL WORK AND TESTS ONLY: the gate
// (local-only.ts) is asked before anything else, so in staging and production a post to
// it, from the page or sent by hand, answers "not found" as an unknown address does, and
// the app's ports are never asked for. Like every action, Next.js refuses one posted from
// another site (T4 §5).
import { notFound, redirect } from 'next/navigation';
import { localTools } from '../local-only.ts';
import { beMadeUpPerson } from './be-made-up-person.ts';
import { fieldsOf, flowDeps, nextVisit } from './next-visit.ts';

export async function beMadeUpPersonAction(form: FormData): Promise<never> {
  const tools = await localTools();
  if (tools === undefined) notFound();
  const answer = await beMadeUpPerson(fieldsOf(form), await nextVisit(), await flowDeps(), tools);
  if (answer === null) notFound();
  redirect(answer.to);
}
