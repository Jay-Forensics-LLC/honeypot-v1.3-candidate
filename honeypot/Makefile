.PHONY: preflight validate bootstrap start stop status readiness backup test stage7-test verify verify-full
preflight validate bootstrap start stop status backup:
	bash scripts/$@.sh
readiness:
	bash scripts/readiness-check.sh
test:
	python3 -B -m unittest discover -s tests -v
stage7-test:
	python3 -B scripts/stage7_tests.py
verify:
	python3 -B scripts/target-validate.py
verify-full:
	python3 -B scripts/target-validate.py --runtime --write-report
