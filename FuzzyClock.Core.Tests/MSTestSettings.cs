// PhraseEngine is a static class with a single global active-provider field.
// Tests run serially (no Parallelize attribute) to ensure locale-switching tests
// do not interfere with each other through shared static state.
