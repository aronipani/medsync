// "Send for training" with the follow-up questions, shared by Settings and the Collect photos screen.
import { Alert } from 'react-native';
import { buildLabel } from './buildInfo.ts';
import { emailTraining, mailAppAvailable, markSent, TRAINING_EMAIL } from './training.ts';

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
