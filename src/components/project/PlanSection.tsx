import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { phaseItemPrompt, phasePrompt, todoPrompt, type Phase, type PlanItem, type ProjectPlan } from '@/projects/model';
import { act } from '@/projects/queries';
import { colors, spacing } from '@/theme';
import { Sheet } from '../Sheet';
import { TextPrompt } from '../TextPrompt';
import type { StartRequest } from './StartSheet';
import { Section, SectionLink } from './Section';

type File = 'plan' | 'todos';
type Selected = { file: File; item: PlanItem; phase?: Phase };

/**
 * The plan's phases (plan-tracker.md) and the todos (todos.md): tick, add,
 * edit, or start a session on any of them.
 */
export function PlanSection({ projectId, data, onChanged, onStart }: {
  projectId: string;
  data: ProjectPlan;
  onChanged: () => void;
  onStart: (start: StartRequest) => void;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<Selected | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<Phase | null>(null);
  const [editing, setEditing] = useState<Selected | null>(null);
  const [adding, setAdding] = useState<File | null>(null);
  const { plan, todos } = data;

  const run = async (method: string, params: unknown[]) => {
    try { await act(method, params); } catch (err: any) { Alert.alert('That did not work', err.message); }
    onChanged();
  };
  // The text seen on the line goes along: the computer changes nothing if the plan moved meanwhile.
  const tick = (file: File, item: { line: number; text: string }, done: boolean) => run('set-plan-item', [projectId, file, item.line, done, item.text]);
  const isOpen = (phase: Phase) => open[phase.line] ?? (phase.line === plan.next?.line);

  const startFor = (target: Selected): StartRequest => target.file === 'todos'
    ? { title: target.item.text, prompt: todoPrompt(data, target.item), planItem: { file: 'todos', itemText: target.item.text } }
    : target.phase && !target.phase.single
      ? { title: target.item.text, prompt: phaseItemPrompt(data, target.phase, target.item), planItem: { file: 'plan', itemText: target.item.text } }
      : { title: target.item.text, prompt: phasePrompt(data, target.phase || { title: target.item.text, line: target.item.line, headingDone: null, items: [], ticked: 0, done: target.item.done }), planItem: { file: 'plan', itemText: target.item.text } };

  return (
    <>
      <Section title={plan.total ? `Plan · ${plan.done} of ${plan.total} done` : 'Plan'}>
        {!data.hasTracker ? (
          <Text style={styles.empty}>No plan tracker yet. Ask a session to write plan-tracker.md, or add the first item.</Text>
        ) : null}
        {plan.phases.map((phase) => phase.single ? (
          <ItemRow
            key={phase.line}
            item={{ line: phase.line, text: phase.title, done: phase.done }}
            onTick={(done) => tick('plan', { line: phase.line, text: phase.title }, done)}
            onLongPress={() => setSelected({ file: 'plan', item: { line: phase.line, text: phase.title, done: phase.done }, phase })}
          />
        ) : (
          <View key={phase.line}>
            <Pressable
              onPress={() => setOpen((o) => ({ ...o, [phase.line]: !isOpen(phase) }))}
              onLongPress={() => setSelectedPhase(phase)}
              style={({ pressed }) => [styles.phase, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen(phase) }}
            >
              <Check done={phase.done} onPress={() => tick('plan', { line: phase.line, text: phase.title }, !phase.done)} />
              <Text style={[styles.phaseTitle, phase.done && styles.doneText]} numberOfLines={2}>{phase.title}</Text>
              <Text style={styles.count}>{phase.ticked}/{phase.items.length}</Text>
              <Ionicons name={isOpen(phase) ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textFaint} />
            </Pressable>
            {isOpen(phase) ? phase.items.map((item) => (
              <ItemRow
                key={item.line}
                item={item}
                indent
                onTick={(done) => tick('plan', item, done)}
                onLongPress={() => setSelected({ file: 'plan', item, phase })}
              />
            )) : null}
          </View>
        ))}
        <SectionLink label="Add to the plan…" onPress={() => setAdding('plan')} />
      </Section>

      <Section title={todos.length ? `Todos · ${todos.filter((t) => !t.done).length} open` : 'Todos'}>
        {todos.map((item) => (
          <ItemRow key={item.line} item={item} onTick={(done) => tick('todos', item, done)} onLongPress={() => setSelected({ file: 'todos', item })} />
        ))}
        <SectionLink label="Add a todo…" onPress={() => setAdding('todos')} />
      </Section>

      <Sheet
        visible={!!selected}
        title={selected?.item.text}
        options={selected ? [
          { label: 'Start a session on this', onPress: () => onStart(startFor(selected)) },
          { label: 'Edit…', onPress: () => setEditing(selected) },
        ] : []}
        onClose={() => setSelected(null)}
      />
      <Sheet
        visible={!!selectedPhase}
        title={selectedPhase?.title}
        options={selectedPhase ? [
          {
            label: 'Start a session on this phase',
            onPress: () => onStart({ title: selectedPhase.title, prompt: phasePrompt(data, selectedPhase), planItem: { file: 'plan', itemText: selectedPhase.title } }),
          },
        ] : []}
        onClose={() => setSelectedPhase(null)}
      />
      <TextPrompt
        visible={!!editing}
        title="Edit"
        initialValue={editing?.item.text || ''}
        onClose={() => setEditing(null)}
        onSubmit={(text) => { if (editing && text && text !== editing.item.text) run('edit-plan-item', [projectId, editing.file, editing.item.line, text, editing.item.text]); }}
      />
      <TextPrompt
        visible={!!adding}
        title={adding === 'todos' ? 'New todo' : 'Add to the plan'}
        confirm="Add"
        onClose={() => setAdding(null)}
        onSubmit={(text) => { if (adding && text) run('append-plan-item', [projectId, adding, text]); }}
      />
    </>
  );
}

function Check({ done, onPress }: { done: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: done }}>
      <Ionicons name={done ? 'checkbox' : 'square-outline'} size={20} color={done ? colors.running : colors.textDim} />
    </Pressable>
  );
}

function ItemRow({ item, indent, onTick, onLongPress }: { item: PlanItem; indent?: boolean; onTick: (done: boolean) => void; onLongPress: () => void }) {
  return (
    <Pressable onLongPress={onLongPress} style={({ pressed }) => [styles.item, indent && styles.indent, pressed && styles.pressed]}>
      <Check done={item.done} onPress={() => onTick(!item.done)} />
      <Text style={[styles.itemText, item.done && styles.doneText]}>{item.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  phase: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  phaseTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  count: { color: colors.textFaint, fontSize: 12 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 6 },
  indent: { paddingLeft: spacing.xl },
  itemText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  doneText: { color: colors.textFaint, textDecorationLine: 'line-through' },
  pressed: { backgroundColor: colors.raised },
  empty: { color: colors.textFaint, fontSize: 13, paddingVertical: spacing.sm },
});
