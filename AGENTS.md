<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Use a shared wallet shell and semantic CSS tokens across all wallet pages so the reference identity remains consistent.
- Keep signed-in pages under the managed authenticated layout; validate administrator privileges in server functions and database policies.
- Store wallet balances as internal account records, not blockchain assets; do not claim custody, on-chain transfers, or decentralization without an actual wallet integration.
