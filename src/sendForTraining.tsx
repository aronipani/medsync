// "Send for training" with the follow-up questions, shared by Settings and the Collect photos screen.
import { Alert } from 'react-native';
import { buildLabel } from './buildInfo.ts';
import { serverAvailable } from './server.ts';
import { emailTraining, mailAppAvailable, markSent, TRAINING_EMAIL, uploadTraining } from './training.ts';

/** Where "Send photos" sends them in this build: the TakeSure server when the build has one, otherwise email. */
export const trainingDestination = (): string => (serverAvailable() ? 'the TakeSure server (anonymous)' : TRAINING_EMAIL);

/** Sends to the TakeSure server: no email, no account; the photos go one by one and the rest follow next time. */
async function sendToServer(): Promise<void> {
  const r = await uploadTraining(buildLabel());
  if (!r.sent && !r.left) return Alert.alert('Nothing new to send', 'All training photos have been sent already.');
  const done = `${r.sent} photo${r.sent === 1 ? '' : 's'} sent.`;
  if (!r.stopped) return Alert.alert('Sent', `${done} Thank you!`);
  const why =
    r.stopped === 'limit'
      ? 'The server takes a limited number of photos a day from each phone.'
      : r.stopped === 'offline'
        ? 'The phone seems to be offline.'
        : 'The server had a problem.';
  Alert.alert(r.sent ? 'Partly sent' : 'Not sent', `${r.sent ? `${done} ` : ''}${why} ${r.left} photo${r.left === 1 ? '' : 's'} will go when you tap Send again${r.stopped === 'limit' ? ' tomorrow' : ''}.`);
}

/** Asks how to send: the Mail app (when set up) or another app through the share sheet (Gmail, Outlook, WhatsApp…). */
async function chooseWay(): Promise<'mail' | 'share' | null> {
  if (!(await mailAppAvailable())) return 'share';
  return new Promise((resolve) =>
    Alert.alert(
      'Send training photos',
      `To ${TRAINING_EMAIL}. If Mail can't send from your account (emails stuck in its Outbox), choose Gmail or another app.`,
      [
        { text: 'Gmail or another app', onPress: () => resolve('share') },
        { text: 'Mail app', onPress: () => resolve('mail') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
    ),
  );
}

/** Sends unsent training photos; after a share-sheet send, asks whether it went out before marking them sent. */
export async function sendForTraining(onDone?: () => void): Promise<void> {
  try {
    if (serverAvailable()) return await sendToServer();
    const way = await chooseWay();
    if (!way) return;
    const r = await emailTraining(buildLabel(), way);
    if (r.kind === 'nothing') {
      Alert.alert('Nothing new to send', 'All training photos have been sent already.');
    } else if (r.kind === 'shared') {
      await new Promise<void>((resolve) =>
        Alert.alert(
          'Did it send?',
          `${r.photos} photo${r.photos === 1 ? '' : 's'} in this zip, to ${TRAINING_EMAIL}.${r.left ? ` ${r.left} more after this.` : ''} Say "Not yet" if it's still in an Outbox or drafts — you can send again.`,
          [
            { text: 'Not yet', style: 'cancel', onPress: () => resolve() },
            {
              text: 'Yes, sent',
              onPress: () => {
                markSent(r.files);
                if (r.left) Alert.alert('More to send', `${r.left} more photos — tap Send for training again.`);
                resolve();
              },
            },
          ],
        ),
      );
    } else if (r.kind === 'sent' && r.left) {
      Alert.alert('More to send', `${r.photos} photos went in this email. ${r.left} more — tap Send for training again.`);
    }
  } catch (e) {
    Alert.alert('Could not send', String(e));
  } finally {
    onDone?.();
  }
}
