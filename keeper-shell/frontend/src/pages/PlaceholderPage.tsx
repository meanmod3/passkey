import { Body1, Title2 } from '@fluentui/react-components';

export function PlaceholderPage({ title, phase }: { title: string; phase: string }): JSX.Element {
  return (
    <div className="p-6 max-w-4xl">
      <div className="flex flex-col gap-1.5">
        <Title2 as="h1">{title}</Title2>
        <Body1 className="text-[var(--text-muted)]">
          Arrives in {phase}.
        </Body1>
      </div>
    </div>
  );
}
