import { Body1, Title2 } from '@fluentui/react-components';

export function PlaceholderPage({ title, phase }: { title: string; phase: string }): JSX.Element {
  return (
    <div className="p-6 max-w-4xl">
      <Title2 as="h1" className="block">{title}</Title2>
      <Body1 className="block mt-2 text-neutral-600">
        Arrives in {phase}.
      </Body1>
    </div>
  );
}
