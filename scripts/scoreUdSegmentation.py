"""Offline glue: use the unmodified official UD evaluator, no NLP reimplementation."""
import importlib.util
import json
import sys
import unittest


def load_scorer(path):
    spec = importlib.util.spec_from_file_location("official_udeval", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


if __name__ == "__main__":
    scorer = load_scorer(sys.argv[1])
    if sys.argv[2] == "--self-test":
        result = unittest.TextTestRunner().run(
            unittest.defaultTestLoader.loadTestsFromTestCase(scorer.TestAlignment)
        )
        sys.exit(0 if result.wasSuccessful() else 1)
    gold = scorer.load_conllu_file(sys.argv[2])
    prediction = scorer.load_conllu_file(sys.argv[3])
    scores = scorer.evaluate(gold, prediction)
    # Dummy syntactic columns in prediction are format scaffolding only.
    # Never report POS, dependency, lemma or other unevaluated capabilities.
    print(json.dumps({name: {
        "precision": scores[name].precision, "recall": scores[name].recall,
        "f1": scores[name].f1, "correct": scores[name].correct,
        "goldTotal": scores[name].gold_total,
        "systemTotal": scores[name].system_total
    } for name in ("Tokens", "Words", "Sentences")}))
