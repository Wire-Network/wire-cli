module.exports = {
  preset: "ts-jest",     
  testEnvironment: "node",

  rootDir: ".",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",  
      },
    ],
  },

  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    '^node:(.*)$': '$1',  
  },
  testMatch: [
    "<rootDir>/src/**/*.(spec|test).(ts|tsx|js)",
    "<rootDir>/tests/**/*.(spec|test).(ts|tsx|js)",
  ],

  verbose: true,
};