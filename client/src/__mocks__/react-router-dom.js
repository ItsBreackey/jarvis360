const React = require('react');

// Minimal manual mock for react-router-dom used in unit tests.
// Keep this small and synchronous so Jest can load it reliably.
module.exports = {
  Link: ({ children, ...props }) => React.createElement('a', props, children),
  Routes: ({ children }) => React.createElement(React.Fragment, null, children),
  Route: (props) => null,
  Navigate: ({ to }) => null,
  // export anything else tests might require as no-ops
};
