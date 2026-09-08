import Icon from './Icon.jsx';

export default function WorkspaceIntro({ eyebrow, title, description, icon, children }) {
  return (
    <section className="workspace-intro on-dark">
      <div className="relative z-10 min-w-0">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-lime-400">
          <Icon name={icon} size={16} />{eyebrow}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-200">{description}</p>
      </div>
      {children ? <div className="relative z-10 flex flex-wrap gap-2">{children}</div> : null}
    </section>
  );
}
