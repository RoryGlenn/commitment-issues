import fs from "fs";
import path from "path";

const unusedConstant = 42;
let unusedLet = "unused";
var unusedVar = true;

const data = {
  a: 1,
  b: 2,
  c: 3,
};

const { a: usedA, b: unusedB, c: unusedC } = data;
const [unusedFirst, usedSecond] = ["first", "second"];
const [unusedIndex, unusedIndex2] = [0, 1];

function unusedFunction(one, two, three) {
  const unusedInner = "hello";
  const usedInner = one + 1;
  return usedInner;
}

function mixedUsage(usedArg, unusedArg1, unusedArg2) {
  const usedValue = usedArg * 2;
  const unusedValue1 = usedArg + 5;
  const unusedValue2 = 100;

  function nestedInner(innerArg, unusedNestedArg) {
    const nestedUnused = "nested";
    return innerArg + usedValue;
  }

  return nestedInner(usedValue, 1);
}

const unusedArrow = (unusedX, unusedY) => {
  const arrowUnused = 5;
  return unusedX + unusedY;
};

const usedArrow = (usedX, unusedY) => {
  const usedX2 = usedX + 1;
  const unusedArrowLocal = "unused";
  return usedX2;
};

class UnusedClass {
  constructor(first, second, unusedThird) {
    this.first = first;
    this.second = second;
    this.unusedThird = unusedThird;
  }

  unusedMethod(unusedParam) {
    const localUnused = "nope";
    return this.first;
  }

  useMethod() {
    const usedLocal = this.first + this.second;
    return usedLocal;
  }
}

class UsedClass {
  constructor(usedValue, unusedValue) {
    this.usedValue = usedValue;
    this.unusedValue = unusedValue;
  }

  measure(unusedCount) {
    const result = this.usedValue * 2;
    const unusedCalc = result + 10;
    return result;
  }
}

function manyUnused() {
  const first = 1;
  const second = 2;
  const third = 3;
  const fourth = 4;
  const fifth = 5;
  const sixth = 6;
  const seventh = 7;
  const eighth = 8;

  const [unusedAlpha, unusedBeta, usedGamma] = ["a", "b", "c"];
  const { x: unusedX, y: unusedY, z: usedZ } = { x: 0, y: 1, z: 2 };

  function innerNested(innerA, unusedInnerB, unusedInnerC) {
    const deepUnused = "deep";
    const deepUsed = innerA + first;
    return deepUsed;
  }

  if (true) {
    const branchUnused = 99;
    const branchUsed = second + third;
    return innerNested(branchUsed, 1, 2);
  }

  return usedZ + first + second + third + fourth + fifth + sixth + seventh + eighth;
}

const moreProblems = {
  unusedProperty: "no-value",
  usedProperty: 123,
  anotherUnused: false,
};

const { usedProperty: keptProperty, unusedProperty: droppedProperty } = moreProblems;

function buildSummary(keep, ignore1, ignore2, ignore3) {
  const keepValue = keep + 1;
  const unusedSummary = "summary";
  const anotherUnusedSummary = "still unused";

  const nested = (arg1, arg2, arg3) => {
    const nestedUsed = arg1 + keepValue;
    const nestedUnusedInner = arg3;
    return nestedUsed;
  };

  return nested(keepValue, 2, 3);
}

const unusedTuple = [1, 2, 3, 4];
const [tupleA, tupleB, tupleC, tupleD] = unusedTuple;

for (let i = 0; i < 4; i += 1) {
  const loopUnusedA = i;
  const loopUnusedB = i * 2;
}

if (unusedVar) {
  const conditionalUnused = "branch";
}

const usedValue = mixedUsage(5, 10, 15);
console.log(usedValue, usedArrow(7, 8), buildSummary(8, 9, 10, 11));

export default {
  usedValue,
  usedArrow,
  buildSummary,
  mixedUsage,
};
