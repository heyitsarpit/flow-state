type ApiReferenceEntry = Readonly<{
  readonly name: string;
  readonly route: string;
  readonly description: string;
  readonly href: string;
}>;

type ApiReferenceSection = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly importPath: string;
  readonly description: string;
  readonly importExample: string;
  readonly entries: ReadonlyArray<ApiReferenceEntry>;
}>;

type ApiReferenceSectionsProps = Readonly<{
  readonly sections: ReadonlyArray<ApiReferenceSection>;
}>;

export function ApiReferenceSections({ sections }: ApiReferenceSectionsProps) {
  return sections.map((section) => (
    <section key={section.id}>
      <h2 id={section.id}>{section.title}</h2>
      <p>{section.description}</p>
      <pre>
        <code>{section.importExample}</code>
      </pre>
      <table>
        <thead>
          <tr>
            <th>API</th>
            <th>Route</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {section.entries.map((entry) => (
            <tr key={entry.name}>
              <td>
                <a href={entry.href}>
                  <code>{entry.name}</code>
                </a>
              </td>
              <td>
                <code>{entry.route}</code>
              </td>
              <td>{entry.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ));
}
